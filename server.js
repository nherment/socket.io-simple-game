var uuid    = require('uuid')
var express = require('express')
var app     = express()
var server  = require('http').createServer(app)
var io      = require('socket.io').listen(server)

var port = 3000

server.listen(port, function(){
  console.log('server listening to http://localhost:'+port)
})

app.use(express.static('./public'))

var availableRooms = []

function getAvailableRoom() {
  var room

  while(availableRooms.length > 0 && !room) {
    if(availableRooms[0].isFull()) {
      availableRooms.shift()
    } else {
      room = availableRooms[0]
    }
  }

  if(!room) {
    room = new Room()
    availableRooms.push(room)
  }

  return room
}

io.sockets.on('connection', function (client) {

  var currentRoom

  client.on('join:room', function () {
    // make sure a client is not in 2 rooms at the same time
    if(currentRoom) {
      currentRoom.leave(client)
      availableRooms.push(currentRoom)
    }

    currentRoom = getAvailableRoom()
    currentRoom.join(client)

    client.emit('client:info', currentRoom.getInfo(client))

  })

  client.on('client:position', function(position) {
    if(currentRoom) {
      currentRoom.updatePosition(client, position)
    }
  })

  client.on('disconnect', function() {
    if(currentRoom) {
      currentRoom.leave(client)
    }
  })


})

var MAX_USERS_PER_ROOM = 3

var roomId = 0;
function Room() {
  this.roomId = roomId ++ // for logging purposes only

  var clients = []

  var clientsInfo = {}

  this.getInfo = function(client) {
    return clientsInfo[client.id]
  }

  this.join = function(client) {
    clients.push(client)
    console.log('client joined room #'+roomId+' ['+client.id+']')
    clientsInfo[client.id] = {
      uid: uuid.v4(),
      color: randomColor(),
      position: {
        x: 0,
        y: 0
      }
    }
    broadcastJoin(client)
    sendOthersInfo(client)
  }

  this.leave = function(client) {
    var clientInfo
    for(var i = 0 ; i < clients.length ; i++) {
      if(clients[i] === client) {
        console.log('client left room #'+roomId+' ['+client.id+']')
        clients.splice(i, 1)
        clientInfo = clientsInfo[client.id]
        clientsInfo[client.id] = undefined
      }
    }

    // to not spam clients if there is a bug
    if(clientInfo) {
      broadcastGone(clientInfo)
    }
  }

  this.isFull = function() {
    return clients.length >= MAX_USERS_PER_ROOM
  }

  this.updatePosition = function(client, position) {
    clientsInfo[client.id].position = position
    broadCastNewPosition(client)
  }

  function broadcastGone(client) {
    for(var i = 0 ; i < clients.length ; i++) {
      var destination = clients[i]
      destination.emit('client:leave', client)
    }
  }

  function broadcastJoin(client) {
    for(var i = 0 ; i < clients.length ; i++) {
      // do not send a client its own data
      if(clients[i] !== client) {
        console.log('sending join of room #'+roomId+' to client ['+clients[i].id+']')
        clients[i].emit('client:join', clientsInfo[client.id])
      }
    }
  }

  function broadCastNewPosition(client) {
    for(var i = 0 ; i < clients.length ; i++) {
      // do not send a client its own data
      if(clients[i] !== client) {
        console.log('sending new position in room #'+roomId+' to client ['+clients[i].id+'] for client ['+client.id+']')
        clients[i].emit('client:update', clientsInfo[client.id])
      }
    }
  }

  /** send other clients info to the one passed in param
   *
   * @param destination
   */
  function sendOthersInfo(destination) {
    for(var i = 0 ; i < clients.length ; i++) {
      if(clients[i] !== destination) {
        console.log('sending clients info in room #'+roomId+' to client ['+destination.id+']')
        destination.emit('client:join', clientsInfo[clients[i].id])
      }
    }
  }
}

function randomColor() {
  // 16777215 == ffffff in decimal but we don't want white color on white background
  // because the user will not be able to see it so I'm caping the clearest color to 16 Millions
  return '#'+Math.floor(Math.random()*16000000).toString(16)
}