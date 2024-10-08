import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'supabase-js'
import { OpenAI } from 'openai'
import { interpretNewChatPrompt } from '../_shared/interpret.ts'

const SYSTEM_USER_ID = 1


async function createExplicitUsers(explicitUsers, message, supabase, chatId) {
  let users = explicitUsers || []

  if (users.length === 0) {
    users = await searchImplicitUsers(message)
  }

  for (const user of users) {
    await createUserIfNotExists(user, supabase)
  }

  return users
}

async function createImplicitUsers(message, supabase, chatId) {
  const users = await searchImplicitUsers(message)

  for (const user of users) {
    await createUserIfNotExists(user, supabase)
  }
}

async function searchImplicitUsers(message) {
  // Implement Google Places API search logic here
  // Return an array of user objects
}

async function createUserIfNotExists(user, supabase) {
  const { data, error } = await supabase
    .from('User')
    .upsert({
      name: user.name,
      phone_number: user.phone_number,
      type: 'human',
      metadata: user.metadata
    }, { onConflict: 'phone_number' })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create/update user: ${error.message}`)
  }

  return data
}

async function addUserToChat(user, chatId, supabase) {
  const { error } = await supabase
    .from('Chat')
    .update({ to: user.id })
    .eq('id', chatId)

  if (error) {
    throw new Error(`Failed to add user to chat: ${error.message}`)
  }
}

async function generateResponse(message, newChatInterpretation) {
  const client = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY'),
  });

  const systemPrompt = `You are an AI assistant in a group chat. The chat context is: ${newChatInterpretation.newChatPrompt}.`;

  const response = await client.chat.completions.create({
    model: Deno.env.get('AZURE_OPENAI_MODEL'),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
  });

  return response.choices[0].message?.content || "I'm sorry, I couldn't generate a response.";
}

async function storeResponse(response, supabase, chatId) {
  const { data, error } = await supabase
    .from('Chat')
    .select('history')
    .eq('id', chatId)
    .single()


  if (error) {
    throw new Error(`Failed to fetch chat history: ${error.message}`)
  }

  const updatedHistory = [
    ...data.history,
    {
      role: 'assistant',
      content: response,
      type: 'message',
      timestamp: new Date().toISOString()
    }
  ]

  const { error: updateError } = await supabase
    .from('Chat')
    .update({ history: updatedHistory })
    .eq('id', chatId)

  if (updateError) {
    console.error(updateError)
    throw new Error(`Failed to update chat history: ${updateError.message}`)
  }
}

async function createChatWithInitialMessage(supabase, message) {
  const initialHistory = [{
    role: 'user',
    content: message,
    type: 'message',
    timestamp: new Date().toISOString()
  }]
  const { data: chatData, error: error } = await supabase
    .from('Chat')
    .insert({
      to: SYSTEM_USER_ID,
      type: 'human',
      history: initialHistory
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create chat with initial message: ${error.message}`)
  }

  return chatData.id
}

Deno.serve(async (req) => {
  const { message } = await req.json()
  const newChatInterpretation = await interpretNewChatPrompt(message)

  const openai = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY'),
  })
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'))
  const chatId = await createChatWithInitialMessage(supabase, message)

  if (newChatInterpretation.shouldCreateUsers) {
    if (newChatInterpretation.explicitNewUsers) {
      const users = await createExplicitUsers(newChatInterpretation.explicitNewUsers, message, supabase, chatId)
    } else {
      const users = await createImplicitUsers(message, supabase, chatId)
    }
    await intiateNewChats(newChatInterpretation, users, supabase, chatId)
  }
  const response = await generateResponse(message, newChatInterpretation)
  await storeResponse(response, supabase, chatId)

  return new Response(
    JSON.stringify({ chatId: chatId }),
    { headers: { "Content-Type": "application/json" } },
  )
})