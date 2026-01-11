const supabase = require("./supabase");

async function test() {
  const { data, error } = await supabase
    .from("messages")
    .insert([
      { username: "Devanshu", text: "Supabase is working 🚀" }
    ]);

  if (error) {
    console.error("❌ Error:", error);
  } else {
    console.log("✅ Inserted:", data);
  }

  const { data: rows } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false });

  console.log("📦 Messages in DB:", rows);
}

test();
