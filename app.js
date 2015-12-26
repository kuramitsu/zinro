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

// ソケット管理 =================================================
var io_game = io.of('/game');           // ゲームの通信用 
var room_villager = 'villager';
var room_werewolf = 'werewolf';
var room_sharer = 'sharer';

function send_chat(socket, room, data) {
    socket.join(room);
    io_game.to(room).emit(room, room + ": " + data);
    // console.log(room + ": " + data);
}
function leave_all_room(socket) {
    socket.leave(room_villager);
    socket.leave(room_werewolf);
}

io_game.on('connection', function(socket){
    // ゲームの進行状況同期用
    socket.on("get_status", function(data) {
        console.log(data.key);   
        socket.json.emit("status", getStatus());
        if (data.key in villagers) {
            // ユーザー自身の情報を返す
            socket.json.emit("user", getUser(data.key));
        }
    });
    // 村に参加する
    socket.on("join", function(data) {
        console.log(data);
        addVillager(data.key, data.name); 
        // 登録情報を返す
        socket.json.emit("user", getUser(data.key));
        // 全員に村民が増えたことを通知する
        io_game.json.emit("status", getStatus());
    });

    // チャット関連
    function send_chatmsg(room, data) {
        socket.join(room);
        io_game.to(room).emit(room, room + ": " + data);
        console.log(room + ": " + data);
    }
    socket.on(room_villager, function(data){
        send_chatmsg(room_villager, data);
    }); 
    socket.on(room_werewolf, function(data){
        send_chatmsg(room_werewolf, data);
    });
    socket.on('disconnected',function() {
        console.log('disconnected');
    }); 
});

// 村の状態管理 ==================================================
var village = {
    name: "ナカヨシ村",
    daytime: 120,
    nighttime: 120,
    roles: {
        村人: {
            num: 2,
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
    roledeath: true     // 初日役職死亡あり
}
var village_state = {
    state: "廃村",      // 廃村 or 村民募集中 or Playing
    days: 0,            // 何日目か
    phase: "昼",        // 昼 or 夜
    time: 0            // 次のフェーズまでの秒数
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
   
function getStatus() {
    var _vlist = getVillagersList();    // キーや役職は隠して送る
    var _wantnum = initvillagernum - _vlist.length; // 募集人数
    var _status = {
        village: village,
        village_state: village_state,
        villagers: _vlist, 
        wantnum: _wantnum
    }
    return _status;
}

function getUser(key) {
    var _user = villagers[key];
    return _user;
}


var uptime = 0;
setInterval(function() {
    if (village_state.state != "廃村" && uptime % 5 == 0) {
        console.log(village_state);
        io_game.json.emit("status", getStatus()); // 定期的に村の状態全員に送る 
    }
    if (village_state.time > 0) {
        village_state.time -= 1;
    } else {    // 制限時間が過ぎたときの処理
        if (village_state.state == "村民募集中") {
            initVillage({}, "廃村");    // 人数が集まらなかったときは廃村
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
    npc = villagers[settings.npckey];
    
    if (npc.role == "人狼" || npc.role == "妖狐") {
        changeRole(npc, "村人");
    } else if (roledeath == false && npc.role != "村人") {
        changeRole(npc, "村人");
    }
}

// 指定の役職に変更する (rolebucketから検索して交代。空ならそのまま)
function changeRole(villager, role) {
    for (var i = 0, len = rolebucket.length; i < len; i++) {
        if (role == rolebucket[i]) {
            rolebucket[i] = villager.role;
            villager.role = role;
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
    } else {
        var villager = {
            name: name,
            alive: true,
            role: getRole()             // ロールの割り当て
        }
        villagers[key] = villager; 
    }
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
   
    // 制限時間の設定
    if (state == "廃村") {
        village_state.time = 0;
    } else if (state == "村民募集中") {
        village_state.time = settings.wanttime;
    }
    
    // 村の状態初期化 
    village_state.days = 0;
    village_state.state = state;

    // すべてのチャットルームから強制退去
    // http://stackoverflow.com/questions/30570658/how-to-disconnect-all-sockets-serve-side-using-socket-io
    io.sockets.sockets.forEach(function(socket) {
        //s.disconnect(true);
        leave_all_room(socket);
    });
    
    // 村民の状態初期化
    initVillager();
    
    // 全員募集ページへ飛ばす
    io_game.json.emit("status", getStatus());
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

var chat = io.of('/chat');
chat.on('connection', function(socket){
    socket.on('emit_from_client', function(data){
        socket.join(data.room);
        // socket.emit("emit_from_server", "you are in " + data.room);
        // socket.broadcast.to(data.room).emit("emit_from_server", data.msg);
        chat.to(data.room).emit("emit_from_server", socket.id + " " + data.msg);
        // io.to(data.room).emit("emit_from_server", data.msg);

        console.log(data);
        // 接続してるやつのみ 
        // socket.emit('emit_from_server', 'hello from server: ' + data); 
        // 接続してるソケット以外全部
        // socket.broadcast.emit('emit_from_server', 'hello from server: ' + data); 
        // 接続してるやつ全部
        // io.sockets.emit('emit_from_server', socket.id + ": " + data); 
    }); 
});



server.listen(settings.port, function () {
    var port = server.address().port;
    console.log('Example app listening port %s', port);
});

