import { Server } from 'socket.io';
export declare function initWebSocketServer(io: Server): void;
export declare function getWebSocketServer(): Server | null;
export declare function emitToAll(event: string, data: unknown): void;
export declare function emitToRoom(room: string, event: string, data: unknown): void;
//# sourceMappingURL=websocket.service.d.ts.map