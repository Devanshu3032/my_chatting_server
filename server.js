const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const supabase = require("./supabase"); // 🔥 Supabase client

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// Use an Environment Variable for the password (set this in Render/Vercel later)
// For now, it defaults to 'admin123'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const pendingUsers = new Map();
const activeUsers = new Map();

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {

    // 1. Send chat history when user connects
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

    // 2. Request Access Logic
    socket.on("request-access", (name) => {
        const cleanName = name.trim().toLowerCase();
        socket.username = name;
        pendingUsers.set(cleanName, socket);

        console.log(`\n[!] REQUEST: "${name}" wants to join.`);
        // Note: You can still see this in the Cloud Logs!
    });

    // 🌟 3. NEW: ADMIN COMMAND LOGIC (Replaces Terminal)
    socket.on("admin-command", (data) => {
        const { password, fullCommand } = data;

        // Security Check
        if (password !== ADMIN_PASSWORD) {
            return socket.emit("system", "❌ Access Denied: Invalid Admin Password");
        }

        const [command, ...nameParts] = fullCommand.trim().split(" ");
        const targetName = nameParts.join(" ").toLowerCase();

        if (command === "allow") {
            const targetSocket = pendingUsers.get(targetName);
            if (targetSocket) {
                targetSocket.authorized = true;
                targetSocket.emit("permission-granted");
                
                activeUsers.set(targetName, targetSocket);
                pendingUsers.delete(targetName);

                io.emit("system", `${targetSocket.username} joined the chat`);
                io.emit("online-users", Array.from(activeUsers.keys()));
                console.log(`✅ ALLOWED via Admin UI: ${targetSocket.username}`);
            }
        } 
        else if (command === "deny") {
            const targetSocket = pendingUsers.get(targetName);
            if (targetSocket) {
                targetSocket.emit("permission-denied");
                targetSocket.disconnect();
                pendingUsers.delete(targetName);
            }
        }
        else if (command === "kick") {
            const targetSocket = activeUsers.get(targetName);
            if (targetSocket) {
                targetSocket.emit("kicked");
                targetSocket.disconnect();
                activeUsers.delete(targetName);
                io.emit("online-users", Array.from(activeUsers.keys()));
            }
        }
    });

    // 4. Chat Message Logic
    socket.on("chat message", async (msg) => {
        if (!socket.authorized) return;

        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Send to everyone live
        io.emit("chat message", { user: socket.username, text: msg, time: timeString });

        // Save to Supabase
        try {
            const { error } = await supabase.from("messages").insert([
                { username: socket.username, text: msg, time: timeString }
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
            io.emit("online-users", Array.from(activeUsers.keys()));
        }
    });
});

// Use process.env.PORT for cloud deployment compatibility
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 DEV COMMUNICATION LIVE`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`Admin Password: ${ADMIN_PASSWORD}`);
    console.log(`-------------------------------------------`);
});