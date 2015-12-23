var settings = require('./settings');
var ECT = require('ect');
var path = require('path')
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

// http://qiita.com/sukobuto/items/b0be22bfebd721854e0b
app.engine('ect', ECT({ watch: true, root: __dirname + '/views', ext: '.ect' }).render);
app.set('view engine', 'ect');

app.use(settings.static_url, express.static('bower_components'));
app.use(settings.static_url, express.static('static'));

// ソケット管理
var io_game = io.of('/game');           // ゲームの状態通信用 

function send_chat(socket, room, data) {
    socket.join(room);
    io_game.to(room).emit(room, room + ": " + data);
    console.log(room + ": " + data);
}

io_game.on('connection', function(socket){
    // ゲームの進行状況同期用
    socket.on("get_status", function(data) {
        console.log(data.key);      // 誰からの通信か       
        socket.json.emit("status", {
            village_state: village_state
        }); 
    })

    // チャット関連
    function send_chatmsg(room, data) {
        socket.join(room);
        io_game.to(room).emit(room, room + ": " + data);
        console.log(room + ": " + data);
    }
    var room_villager = 'villager';
    var room_werewolf = 'werewolf';

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

// 村の状態管理
var village = {
    name: "CITS村"
}
var village_state = {
    days: 0,
    phase: "廃村"    // 廃村 or 村民募集中 or 昼 or 夜
}
var village_roles = [];
var rolenum = {
    村人: 2,
    占い師: 1,
    人狼: 1
}
function strVillageState(state) {
    return state.days + "日目" + " " + state.phase;
}


// 村民管理
var villagers = {};     // ローカルキーで管理
var villager_name_tbl = {};      // 名前でキーを逆引き
var villager_key_list = [];      // ローカルキー一覧
function addVillager(key, name) {
    villagers[key] = {
        name: name
    };
    villager_name_tbl[name] = key;
    villager_key_list.push[key];
} 
// function setVillagerRole(key, )

// 村の初期化
function initVillage() {

}


// 村の設定
app.get('/dev', function (req, res) {
    res.render("dev", {
        host: req.headers.host,
        static_url: settings.static_url,
        village: village
    });
});

app.get('/', function (req, res) {
    //res.send('Hello World!');
    res.render("index", {
        host: req.headers.host,
        static_url: settings.static_url,
        village_state: strVillageState(village_state)
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

