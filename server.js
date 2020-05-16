const path = require('path');
const http = require('http');
const express = require('express');
const mongo = require('mongodb').MongoClient;
const socketio = require('socket.io');
const client = require('socket.io').listen(4000).sockets;
const formatMessage = require('./utils/messages');
const {userJoin, getCurrentUser, userLeave, getRoomUsers} = require('./utils/users');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

//Connect to mongo
mongo.connect('mongodb://127.0.0.1/chatbox', function(err, db) {
    if(err){
        throw err;
    }

    console.log(('MongoDB Connected'));
    
    //COnnect to socket
    client.on('connection', function(socket){
        let chat = db.collections('chats');

        // Create fun to send status
        sendStatus = function(s){
            socket.emit('status', s);
        }

        // Get chats from mongo collection
        chat.find().limit(100).sort({_id:1}).toArray(function(err, res){
            if(err){
                throw err;
            }
            // emit the messages
            socket.emit('output', res);
        });
        // Handle input events
        socket.on('input', function(data){
            let name = data.name;
            let message = data.message;

            // check for name and msg
            if(name == '' || message == ''){
                // send error status
                sendStatus('Please enter a name and message');
            } else{
                // inert msg
                chat.insert({name: name, message: message}, function(){
                    client.emit('output', [data]);

                    // send status object
                    sendStatus({
                        message: 'Message sent',
                        clear: true
                    });
                });
            }
        });

        // handle  clear
        socket.on('clear', function(){
            // remove all chats from collections
            chat.remove(), function(){
                //emit  cleared
                socket.emit('clear');
            }
        });
    });
});

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


// Set static folder
app.use(express.static(path.join(__dirname,'public')));

const botName = 'ChatBox Bot';

// run when a client connects
io.on('connection', socket => {
    socket.on('JoinRoom', ({username, room}) => {
        const user = userJoin(socket.id, username, room);
        
        socket.join(user.room);
         // Welcome current user
    socket.emit('message', formatMessage(botName, 'Welcome to Chat Box'));

    // broadcast when user joins
    socket.broadcast.to(user.room).emit('message', formatMessage(botName, `${user.username} has joined a chat`));

    // Send user and room info
    io.to(user.room).emit('roomUsers', {
        room : user.room,
        users : getRoomUsers(user.room)
        });
    });

    // listen for chatMessage
    socket.on('chatMessage', (msg) => {
        console.log(msg);
        const  user = getCurrentUser(socket.id);
        io.to(user.room).emit('message', formatMessage(user.username, msg));
    });

    //when dissconects
    socket.on('disconnect', () => {
        const user = userLeave(socket.id);

        if(user) {
            io.to(user.room).emit('message', formatMessage(botName,`${user.username} has left the chat`));
        
            // Send user and room info
        io.to(user.room).emit('roomUsers', {
            room : user.room,
            users : getRoomUsers(user.room)
        });
        
        }
    });
});

const PORT = 3000 || process.env.PORT;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));