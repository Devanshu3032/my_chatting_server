const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const readline = require("readline");
const supabase = require("./supabase");   // 🔥 Supabase client
const { time } = require("console");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const pendingUsers = new Map();
const activeUsers = new Map();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {

    // Send chat history when user connects
supabase
  .from("messages")
  .select("*")
  .order("created_at", { ascending: true })
  .then(({ data, error }) => {
    if (!error) {
      socket.emit("chat-history", data);
    }
  });

  socket.authorized = false;

  socket.on("request-access", (name) => {
    const cleanName = name.trim().toLowerCase();
    socket.username = name;
    pendingUsers.set(cleanName, socket);

    console.log(`\n[!] REQUEST: "${name}" wants to join.`);
    console.log(`👉 allow ${cleanName} | deny ${cleanName}`);
  });

  socket.on("chat message", async (msg) => {
    if (!socket.authorized) return;

    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Send to everyone
io.emit("chat message", { user: socket.username, text: msg , time : timeString });

    // Save to Supabase
    try {
      const { error } = await supabase.from("messages").insert([
        { username: socket.username, text: msg , time : timeString }
      ]);

      if (error) console.error("❌ Supabase error:", error);
    } catch (err) {
      console.error("❌ DB crash:", err);
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      const cleanName = socket.username.toLowerCase();
      pendingUsers.delete(cleanName);
      activeUsers.delete(cleanName);
      io.emit("system", `${socket.username} left the chat`);
      console.log(`\n[-] ${socket.username} has left the server.`);
      
      io.emit("online-users", Array.from(activeUsers.keys()));


    }
  });
});

// Terminal commands
rl.on("line", (input) => {
  const [command, ...nameParts] = input.trim().split(" ");
  const targetName = nameParts.join(" ").toLowerCase();

  if (command === "allow") {
    const targetSocket = pendingUsers.get(targetName);
    if (targetSocket) {
      targetSocket.authorized = true;
      targetSocket.emit("permission-granted");
      io.emit("system", `${targetSocket.username} joined the chat`);
       io.emit("online-users", Array.from(activeUsers.keys()));
 
      activeUsers.set(targetName, targetSocket);
      pendingUsers.delete(targetName);
      console.log(`✅ ALLOWED: ${targetSocket.username} is now active.`);
    } else {
      console.log(`User "${targetName}" not found.`);
    }
  } 
  else if (command === "deny") {
    const targetSocket = pendingUsers.get(targetName);
    if (targetSocket) {
      targetSocket.emit("permission-denied");
      targetSocket.disconnect();
      pendingUsers.delete(targetName);
      console.log(`❌ DENIED: ${targetName}`);
    }
  }
  else if (command === "kick") {
    const targetSocket = activeUsers.get(targetName);
    if (targetSocket) {
      targetSocket.emit("kicked");
      targetSocket.disconnect();
      io.emit("online-users", Array.from(activeUsers.keys()));

      activeUsers.delete(targetName);
      console.log(`🚫 KICKED: ${targetSocket.username}`);
    } else {
      console.log(`User "${targetName}" is not active.`);
    }
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 DEV COMMUNICATION LIVE`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Commands: allow [name], deny [name], kick [name]`);
  console.log(`-------------------------------------------`);
});
