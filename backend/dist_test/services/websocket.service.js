"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocketServer = initWebSocketServer;
exports.getWebSocketServer = getWebSocketServer;
exports.emitToAll = emitToAll;
exports.emitToRoom = emitToRoom;
let ioInstance = null;
function initWebSocketServer(io) {
    ioInstance = io;
    io.on('connection', (socket) => {
        console.log(`[WebSocket] Client connected: ${socket.id}`);
        socket.on('disconnect', () => {
            console.log(`[WebSocket] Client disconnected: ${socket.id}`);
        });
        socket.on('join_room', (room) => {
            socket.join(room);
        });
    });
    console.log('✅ WebSocket server initialized');
}
function getWebSocketServer() {
    return ioInstance;
}
function emitToAll(event, data) {
    if (ioInstance) {
        ioInstance.emit(event, data);
    }
}
function emitToRoom(room, event, data) {
    if (ioInstance) {
        ioInstance.to(room).emit(event, data);
    }
}
//# sourceMappingURL=websocket.service.js.map