var settings = require('./settings');

console.log(settings.port);
console.log(settings.admin);

var app = require('http').createServer(handler),
    io = require('socket.io').listen(app),
    fs = require('fs'),
    ejs = require('ejs');

var template = fs.readFileSync(__dirname + '/templates/index.ejs', 'utf-8');


function handler(req, res) {
    // https://nodejs.org/api/url.html
    //switch (req.url) {
    //    case 
    //}


    var data = ejs.render(template, {
        host: req.headers.host
    });
    res.writeHead(200);
    res.write(data);
    res.end();
}

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

var news = io.of('/news');
news.on('connection', function(socket){
    socket.emit('emit_from_server', new Date()); 
});



app.listen(settings.port);
