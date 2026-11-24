export const configureRealtime = (io, roomService) => {
  io.on("connection", (socket) => {
    socket.on("join_room", async (code, acknowledge) => {
      try {
        const room = await roomService.getRoom(String(code).toUpperCase());
        socket.join(room.code);
        acknowledge?.({ ok: true, room });
      } catch (error) {
        acknowledge?.({ ok: false, error: error.message });
      }
    });
  });
};
