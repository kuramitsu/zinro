var settings = require('./settings');
var ECT = require('ect');
var path = require('path')
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var bodyParser = require('body-parser');

// http://qiita.com/sukobuto/items/b0be22bfebd721854e0b
app.engine('ect', ECT({ watch: true, root: __dirname + '/views', ext: '.ect' }).render);
app.set('view engine', 'ect');

app.use(settings.static_url, express.static('bower_components'));
app.use(settings.static_url, express.static('static'));

// http://qiita.com/K_ichi/items/c70bf4b08467717460d5
// https://github.com/expressjs/body-parser 
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());


// ZOMBIE関連
function replaceText(text, n, value) {
    return text.substr(0, n) + value + text.substr(n+1);
}
function zombieText(text, loss) {     // 元の文字列をランダムに欠損させる
    var _len = text.length;
    var _val = "…";
    for (var repnum = _len * loss; repnum > 0; repnum--) {
        var n = Math.floor(Math.random() * _len);
        text = replaceText(text, n, _val);
    }
    return text;
}

// 勝敗チェック
function getGameStatus() {
    // 各陣営の人数チェック
    var _gamestatus = undefined;
    var victory = undefined;
    var campct = {
        "村人": 0,
        "人狼": 0,
        "妖狐": 0
    }
    for (var key in villagers) {
        var _v = villagers[key];
        if (_v.alive == false) {
            continue;
        }
        if (_v.role == "人狼") {
            campct["人狼"] += 1;
        } else if (_v.role == "妖狐"){
            campct["妖狐"] += 1;
        } else {
            campct["村人"] += 1;
        }
    }

    if (campct["村人"] <= campct["人狼"]) { // 人狼または妖狐の勝利
        if (campct["妖狐"] > 0) {
            victory = "妖狐";
        } else {
            victory = "人狼";
        }
    } else if (campct["人狼"] == 0) {   // 村人または妖狐の勝利
        if (campct["妖狐"] > 0) {
            victory = "妖狐";
        } else {
            victory = "村人";
        }
    }

    if (victory) {  // 勝敗が決まった場合
        var _winners = []; 
        var _losers = [];
        for (var key in villagers) {
            var _v = villagers[key];
            var _camp = village.roles[_v.role].camp;
            if (_camp == victory) {
                _winners.push(_v);
            } else {
                _losers.push(_v);
            }
        }
        _gamestatus = {
            victory: victory,
            winners: _winners,
            losers: _losers
        }
    }
    return _gamestatus;
}

//
var gamestatus = undefined;


// 噛関連 ======================================================
var bitetargets = {};   // 日 => target名
var divinestatus = {};  // 日 => 対象の名前と役職
var guardtargets = {};  // 日 => target名　// 守る対象（誰でもOK）

// 吊、噛まれた人
var votestatus = {};    // 吊  日 => status
var victim = {};        // 噛　日 => target




// ソケット管理 =================================================
var io_game = io.of('/game');           // ゲームの通信用 
var room_villager = 'villager';
var room_werewolf = 'werewolf';
var room_sharer = 'sharer';

function send_chat(socket, room, data) {
    socket.join(room);
    io_game.to(room).emit(room, room + ": " + data);
}
function leave_all_room(socket) {
    socket.leave(room_villager);
    socket.leave(room_werewolf);
}


io_game.on('connection', function(socket){
    // ゲームの進行状況同期用
    socket.on("get_status", function(data) {
        socket.json.emit("status", getStatus());
    });
    socket.on("get_user", function(data) {
        if (data.key in villagers) {
            socket.join(room_villager);
            // ユーザー自身の情報を返す
            var _user = getUser(data.key);
            if (_user.role == "人狼") {         // 人狼一覧を返す
                socket.join(room_werewolf);
                var _wstatus = getWerewolfStatus();
                io_game.to(room_werewolf).emit("werewolfstatus", _wstatus);
            } 
            socket.json.emit("user", _user);
        } else if (village_state.state == "Playing") {
            socket.join(room_villager);
            var _user = {       // 観戦だけできるようにする
                name: "名無し",
                role: "観戦者",
                alive: true
            }
            socket.json.emit("user", _user);
        }
    });
    // 村に参加する
    socket.on("join", function(data) {
        if (village_state.state == "村民募集中") {
            if (rolebucket.length == 0) {
                return;
            }
            addVillager(data.key, data.name); 
            // 登録情報を返す
            var _user = getUser(data.key);
            socket.join(room_villager);
            if (_user.role == "人狼") {
                socket.join(room_werewolf);
                var _wstatus = getWerewolfStatus();
                io_game.to(room_werewolf).emit("werewolfstatus", _wstatus);
            }
            socket.json.emit("user", _user);
        
            // 定員に達したらゲームスタート!
            if (rolebucket.length == 0) {
                village_state.time = village.nighttime;   // 保険
                village_state.state = "Playing";
                nextPhase();
            }
        
            // 全員に村の状態を通知する
            io_game.json.emit("status", getStatus());
        }
    });
    // 投票する
    socket.on("vote", function(data) {
        var _v = getUser(data.key);
        var _t = getUserFromName(data.target);
        if (village_state.phase != "昼") {  // 夜のみ有効
            return;
        }
        // 投票権限がある人物か判定
        if (!(_v && _t)) {  // 噛み元や噛み先が村民じゃない
            return;
        }
        if (!(_v.alive && _t.alive)) {  // どっちかすでに死んでる
            return;
        }
        _v.votetargets[village_state.days] = data.target;   // 集計対象は名前のみ
        socket.json.emit("voteselected", data.target);
    });
    // 占う
    socket.on("divine", function(data) {
        var _v = getUser(data.key);
        var _t = getUserFromName(data.target);
        if (village_state.phase != "夜") {  // 夜のみ有効
            return;
        }
        // 占い権限がある人物か判定
        if (!(_v && _t)) {  // 噛み元や噛み先が村民じゃない
            return;
        }
        if (!(_v.alive)) {  // すでに死んでる
            return;
        }
        if (_v.role != "占い師") {    // 占い師じゃない
            return;
        }
        // まだ占っていないときのみ占う
        if (!divinestatus[village_state.days]) {
            divinestatus[village_state.days] = {
                name: _t.name,
                divination: village.roles[_t.role].divination
            }
            if (_t.role == "妖狐") {    // 妖狐は死亡する
                _t.alive = false;
                victim[village_state.days] = [_t.name];
            }
        } 
        socket.json.emit("divinestatus", divinestatus);
    });
    // 噛む
    socket.on("bite", function(data) {
        var _v = getUser(data.key);
        var _t = getUserFromName(data.target);
        if (village_state.phase != "夜") {  // 夜のみ有効
            return;
        }
        // 噛む権限がある人物か判定
        if (!(_v && _t)) {  // 噛み元や噛み先が村民じゃない
            return;
        }
        if (!(_v.alive && _t.alive)) {  // どっちかすでに死んでる
            return;
        }
        if (_v.role != "人狼") {    // 噛み元が人狼じゃない
            return;
        }
        if (_t.role == "人狼") {    // 噛み先が　人狼
            return;
        }
        // 妖狐　狩人の判定は「噛」フェーズで実施
        bitetargets[village_state.days] = _t;
        io_game.to(room_werewolf).emit("biteselected", data.target);  // 人狼全員に送付
    });
    // 守る
    socket.on("guard", function(data) {
        var _v = getUser(data.key);
        var _t = getUserFromName(data.target);
        if (village_state.phase != "夜") {  // 夜のみ有効
            return;
        }
        // 守る権限がある人物か判定
        if (!(_v && _t)) {  // 噛み元や噛み先が村民じゃない
            return;
        }
        if (!(_v.alive && _t.alive)) {  // どっちかすでに死んでる
            return;
        }
        if (_v.role != "狩人") {    // 守り元が狩人じゃない
            return;
        }
        if (_t.role == "狩人") {    // 守り先が狩人
            return;
        }
        guardtargets[village_state.days] = _t;
        socket.json.emit("guardselected", data.target);     // 
    });

    // チャット関連
    function send_chatmsg(room, name, msg) {
        socket.join(room);  // 保険
        io_game.to(room).emit(room, {
            name: name,
            msg: msg
        });
    }
    socket.on(room_villager, function(data){
        // 村民チャットは「いつでも」使える
        // 死亡してる場合名前が「死者」になって声がかすれる
        var _sender = getUser(data.key);
        if (_sender) {  //　村民である
            var _name = _sender.name;
            var _msg = data.msg;
            if (_sender.alive) {    // 生きてる
                send_chatmsg(room_villager, _name, _msg);
            } else if (village.zombie) {
                send_chatmsg(room_villager, 
                    settings.zombiename, 
                    zombieText(_msg, village.loss));
            }
        }
    }); 
    socket.on(room_werewolf, function(data){
        // 人狼チャットは「夜のみ」使える
        // 死亡してる場合名前が「死者」になって声がかすれる
        var _sender = getUser(data.key);
        if (_sender) {  //　村民である
            if (_sender.role == "人狼" && village_state.phase == "夜") { 
                var _name = _sender.name;
                var _msg = data.msg;
                if (_sender.alive) {    // 生きてる
                    send_chatmsg(room_werewolf, _name, _msg);
                } else if (village.zombie) {
                    send_chatmsg(room_werewolf, 
                        settings.zombiename, 
                        zombieText(_msg, village.loss));
                }
            }
        }
    });
    socket.on('allchat', function(data) {       // 村人じゃなくても送れる
        var _sender = getUser(data.key);
        if (_sender) {
            io_game.emit('allchat', {name: _sender.name, msg: data.msg});
        } else {
            io_game.emit('allchat', {name: '観戦者', msg: data.msg});
        }
    });

    socket.on('disconnected',function() {
        console.log('disconnected');
    }); 
});


// 村の状態管理 ==================================================
var village = {
    name: "ナカヨシ村",
    daytime: settings.daytime,
    nighttime: settings.nighttime,
    hangtime: settings.hangtime,
    bitetime: settings.bitetime,
    roles: {
        村人: {
            num: 1,
            camp: "村人",           // 陣営
            divination: "村人",     // 占った時の表示
            chats: [room_villager]
        },
        占い師: {
            num: 1,
            camp: "村人",
            divination: "村人",
            chats: [room_villager]
        },
        人狼: {
            num: 1,
            camp: "人狼",
            divination: "人狼",
            chats: [room_villager, room_werewolf]
        },
        狂人: {
            num: 1,
            camp: "人狼",
            divination: "村人",
            chats: [room_villager]
        },
        狩人: {
            num: 0,
            camp: "村人",
            divination: "村人", 
            chats: [room_villager]
        },
        霊能者: {
            num: 0,
            camp: "村人",
            divination: "村人", 
            chats: [room_villager]
        },
        共有者: {
            num: 0,
            camp: "村人",
            divination: "村人",
            chats: [room_villager, room_sharer]
        },
        妖狐: {
            num: 0,
            camp: "妖狐",
            divination: "村人",     // 占われた時点で死亡する
            chats: [room_villager]
        }
    },
    firstnpc: true,     // 初日犠牲者はNPC
    roledeath: true,    // 初日役職死亡あり
    zombie: true,       // 死亡してもチャットに参加できる
    loss: 0.2           // 欠損率 (死者の会話が…になる箇所)
}
var village_state = {
    state: "廃村",      // 廃村 or 村民募集中 or Playing or 終戦
    days: 1,            // 何日目か
    phase: "吊",        // 昼 => 吊(勝敗判定) => 夜 => 噛(勝敗判定) => 
    time: 0            // 次のフェーズまでの秒数
}


// 投票集計関数
function countVote(day) {
    var _hangedman = undefined;
    var _votetbl = {};
    var _max = 0;
    for (var key in villagers) {
        var _v = villagers[key];
        if (_v.alive == false) {    // 死人は投票できない
            continue;
        }
        var _target = _v.votetargets[day];
        if (_target) {
            if (!(_target in _votetbl)) {
                _votetbl[_target] = [];
            }
            _votetbl[_target].push(_v.name);    // 投票者
        }
    }
    // 処刑対象を決める
    for (var _target in _votetbl) {
        var _ct = _votetbl[_target].length;
        if (_ct > _max) {
            _hangedman = _target;
            _max = _ct;
        } else if (_ct == _max) {       // 同数ならランダムにどっちか
            if (Math.random() < 0.5) {  // 1/2 で入れ替え
                _hangedman = _target;
            }
        }
    }
    var _votestatus = {
        hangedman: _hangedman,
        votetbl: _votetbl
    };
    return _votestatus;
}


function nextPhase() {
    if (village_state.state == "Playing") {
        switch (village_state.phase) {
            case "昼":
                console.log("昼 => 吊");
                // 投票結果の集計処理
                var _vstatus = countVote(village_state.days);
                votestatus[village_state.days] = _vstatus;
                if (_vstatus.hangedman) {
                    var _hangedman = getUserFromName(_vstatus.hangedman);
                    _hangedman.alive = false;      // 死亡
                    village_state.time = village.hangtime;
                    village_state.phase = "吊";
                } else {        // 投票なしは強制的に廃村にする
                    initVillage({}, "廃村");
                }
                break;
            case "吊":
                console.log("吊 => 夜");
                village_state.time = village.nighttime;
                village_state.phase = "夜";
                gamestatus = getGameStatus();
                break;
            case "夜":
                console.log("夜 => 噛");
                village_state.time = village.bitetime;
                village_state.phase = "噛";
                // ターゲットを噛む
                // 狩人の守り対象取得
                var _victim = undefined;    // 犠牲者
                var _g = guardtargets[village_state.days];
                var _b = bitetargets[village_state.days];
                if (_b && _b.role != "妖狐") {   // 妖狐以外の噛先が指定されている
                    if (_g) {   // 守り先が指定されている
                        if (_g.name != _b.name) {   // 守り先が外れてる
                            _victim = _b;
                        }
                    } else {
                        _victim = _b;
                    }
                }
                if (_victim) {
                    _victim.alive = false;      // 人狼による殺害
                    if (victim[village_state.days]) {   // すでに占いによって妖狐が死んでる場合
                        if (victim[village_state.days][0] != _victim.name) {    // 対象が異なる場合のみ
                            if (Math.random() < 0.5) {  // 1/2 で先頭に挿入
                                victim[village_state.days].unshift(_victim.name);
                            } else {
                                victim[village_state.days].push(_victim.name);
                            }
                        }
                    } else {
                        victim[village_state.days] = [_victim.name];
                    }
                } 
                break;
            case "噛":
                console.log("噛 => 昼");
                village_state.time = village.daytime;
                village_state.days += 1;
                village_state.phase = "昼";
                gamestatus = getGameStatus();
                break;
        }
        if (gamestatus) {   // 勝敗が決してたら
            console.log(gamestatus);
            village_state.state = "終戦";
        }
        // 全員に通知
        io_game.json.emit("status", getStatus());
    }
}


function getVillagersList() {
    var _villagers = [];
    for (var key in villagers) {
        var v = {
            name: villagers[key].name,
            alive: villagers[key].alive
        }
        _villagers.push(v);
    }
    return _villagers
}

function getVillagersNum() {
    var ct = 0;
    for (var key in villagers) {
        ct++;
    }
    return ct;
}
   
function getStatus() {
    var _vlist = getVillagersList();    // キーや役職は隠して送る
    var _wantnum = initvillagernum - _vlist.length; // 募集人数
    var _status = {
        village: village,
        village_state: village_state,
        villagers: _vlist, 
        wantnum: _wantnum,
        victim: victim,
        votestatus: votestatus,
        gamestatus: gamestatus
    };
    return _status;
}
function getWerewolfStatus() {      // 人狼のみ取得できる情報
    var _status = {
        werewolves: getRoleNames("人狼")
    };
    return _status;
}


function getTime() {
    return village_state.time;
}

function getUser(key) {
    var _user = villagers[key];
    return _user;
}

function getRoleNames(role) {
    var _users = [];

    for (var key in villagers) {
        if (villagers[key].role == role) {
            _users.push(villagers[key].name);
        }
    }
    return _users;
}


function getUserFromName(name) {
    var _user = undefined;
    for (var key in villagers) {
        if (villagers[key].name == name) {
            _user = villagers[key];
            break;
        }
    }
    return _user;
}


var uptime = 0;
setInterval(function() {
    if (village_state.state != "廃村" && village_state.state != "終戦" && uptime % 5 == 0) {
        console.log(village_state);
        io_game.json.emit("time", getTime()); // 定期的に制限時間の同期とる（） 
        // io_game.json.emit("status", getStatus()); // 定期的に村の状態を全員に送る 
    }
    if (village_state.time > 0) {
        village_state.time -= 1;
    } else {    // 制限時間が過ぎたときの処理
        switch (village_state.state) {
            case "村民募集中":
                initVillage({}, "廃村");    // 人数が集まらなかったときは廃村
                break;
            case "Playing":
                nextPhase();
                break;
        }
    }
    uptime += 1;
}, 1000);



// 村民管理 =====================================================================
var villagers = {};         // zinrokey => villager 
var initvillagernum = 0;    // 初期人数
var rolebucket = [];        // 役職選択用


// 村民の初期化　＆　NPCの設定
function initVillager() {
    villagers = {};
    initRolebucket();
    // NPC(初日犠牲者)の設定
    if (village.firstnpc) {
        addNPC(village.roledeath);
    }
}

function addNPC(roledeath) {
    addVillager(settings.npckey, settings.npcname); 
    npc = getUser(settings.npckey);
    
    if (npc.role == "人狼" || npc.role == "妖狐") {
        //changeNGRole(npc, "人狼");
        changeNGRoles(npc, ["人狼", "妖狐"]);
    } else if (roledeath == false && npc.role != "村人") {
        changeRole(npc, "村人");
    }
}

// 指定の役職に変更する (rolebucketから検索して交代。空ならそのまま)
function changeRole(villager, role) {
    for (var i = 0, len = rolebucket.length; i < len; i++) {
        if (role == rolebucket[i]) {
            var _role = rolebucket[i];
            rolebucket[i] = villager.role;
            villager.role = _role;
            break; 
        }
    }
}
// 指定以外の役職に変更する (rolebucketから検索して交代。空ならそのまま)
function changeNGRole(villager, ngrole) {
    for (var i = 0, len = rolebucket.length; i < len; i++) {
        if (ngrole != rolebucket[i]) {
            var _role = rolebucket[i];
            rolebucket[i] = villager.role;
            villager.role = _role;
            break; 
        }
    }
}
// 指定以外の役職に変更する (rolebucketから検索して交代。空ならそのまま)
function changeNGRoles(villager, ngroles) {
    for (var i = 0, len = rolebucket.length; i < len; i++) {
        var _role = rolebucket[i]; 
        var _change = true;
        for (var k = 0, rlen = ngroles.length; k < rlen; k++) {
            var _ngrole = ngroles[k];
            if (_role == _ngrole) {     // 一つでもNGなら駄目
                _change = false;
                break;
            }
        }
        if (_change) {
            rolebucket[i] = villager.role;
            villager.role = _role;
            break; 
        }
    }
}

function getRole() {
    var role = rolebucket.pop();
    if (!role) {    // 配列空っぽだったら
        role = "村人";
    }
    return role;
}

function addVillager(key, name) {
    if (key in villagers) {
        console.log("Duplicate key : " +  key);
        return;
    }
    var villager = {
        name: name,
        alive: true,
        role: getRole(),    // ロールの割り当て
        votetargets: {}     // 日ごとの投票先  投票してなかったら突然死
    }
    villagers[key] = villager;
    return villager;
} 

function initRolebucket() {
    rolebucket = [];    // 空にする
    for (var key in village.roles) {
        var role = village.roles[key];
        for (var i = 0; i < role.num; i++) {
            rolebucket.push(key);
        }
    }
    initvillagernum = rolebucket.length;
    shuffleArray(rolebucket);
    // console.log(rolebucket);
}

// Fisher Yates Shuffle
function shuffleArray(array) {
    var n = array.length, t, i;

    while (n) {
        i = Math.floor(Math.random() * n--);
        t = array[n];
        array[n] = array[i];
        array[i] = t;   
    }
    return array;
}

// function setVillagerRole(key, )


function isObject(o) {
    return (o instanceof Object && !(o instanceof Array)) ? true : false;
};
function dictUpdate(target, option) {
    if (isObject(target) == false) {
        return target;
    }
    for (var key in target) {
        if (key in option) {
            if (isObject(target[key])) {
                dictUpdate(target[key], option[key]);
            } else {
                target[key] = option[key];
            }
        }
    }
    return target
}


// 村の初期化
function initVillage(village_option, state) {
    // オプションの反映
    dictUpdate(village, village_option);
   
    // 村民の状態初期化
    initVillager();
    
    // 村の状態初期化 
    village_state.days = 1;
    village_state.phase = "吊";
    village_state.state = state;

    bitetargets = {};   // 日 => target名
    divinestatus = {};
    guardtargets = {};  // 日 => target名
    votestatus = {};   // 吊  日 => status
    victim = {};      // 噛　日 => targets (妖狐含めて複数ありえる)

    gamestatus = undefined;

    // すべてのチャットルームから強制退去
    // http://stackoverflow.com/questions/30570658/how-to-disconnect-all-sockets-serve-side-using-socket-io
    io.sockets.sockets.forEach(function(socket) {
        //s.disconnect(true);
        leave_all_room(socket);
    });
    
    // 制限時間の設定
    if (state == "廃村") {
        village_state.time = 0;
    } else if (state == "村民募集中") {
        village_state.time = settings.wanttime;
    }
    
    // 全員募集ページへ飛ばす
    var _status = getStatus();
    _status.reset = true;   // クライアント側も初期化させる
    io_game.json.emit("status", _status);
}


// 村の設定
app.get('/init_village', function (req, res) {
    if (village_state.state == "廃村") {
        res.render("init_village", {
            host: req.headers.host,
            static_url: settings.static_url,
            village: village
        });
    } else {
        res.render("destroy_village", {
            host: req.headers.host,
            static_url: settings.static_url,
            village: village,
            village_state: village_state
        });
    }
});
app.post('/init_village', function (req, res) {
    var village_option = req.body;
    console.log(village_option);
    initVillage(village_option, "村民募集中");   
    res.end();
});
app.post('/destroy_village', function (req, res) {
    initVillage({}, "廃村");   
    res.end();
});

app.get('/zinro', function (req, res) {
    //res.send('Hello World!');
    res.render("index", {
        host: req.headers.host,
        static_url: settings.static_url
    });
});


server.listen(settings.port, function () {
    var port = server.address().port;
    console.log('Example app listening port %s', port);
});

