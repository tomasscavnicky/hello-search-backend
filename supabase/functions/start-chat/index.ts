import "jsr:@supabase/functions-js/edge-runtime.d.ts"

console.log("Hello from Functions!")

Deno.serve(async (req) => {
  const { message } = await req.json()

  // TODO:
  // create new chat record
  // store the new incoming message as the first message in the chat history
  // [conditional] check if any new users/contacts were explicitly added to the initial chat message
    // [conditional] if no explicit users/contacts, look for implicit users by searching Google Places API
    // [conditional] create all new users and create a record in the history of chat about adding new users -- this will help LLM decide in the future if the user wants to add new users
  // [conditional] create system user (agent) based on the first chat message, i.e. voice agent on Vapi
  // [conditional] create new chats with new users, i.e. initiate new phone calls via Vapi
  // generate response stream and start storing the stream in chat history (UI is subscribed to changes so will display these changes as they come)

  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" } },
  )
})