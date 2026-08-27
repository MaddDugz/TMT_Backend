import {supabase} from "./client.ts";

async function test(){
    const { data, error } = await supabase.from("claims").select("*").limit(1);
  console.log({ data, error });
}

test()