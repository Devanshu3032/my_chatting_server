const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://lywegbavrslaitiaxngr.supabase.co",
  "sb_publishable_zDLWow5K1DivQZn3yFj6tw_e9Hsmzh0"
);

module.exports = supabase;
