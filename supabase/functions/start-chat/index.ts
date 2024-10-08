import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'supabase-js'
import OpenAI from 'openai'
import { interpretNewChatPrompt } from '../_shared/interpret.ts'

const SYSTEM_USER_ID = ''  // TODO: get this from env. migration should always create this user if it does not exist


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

async function generateResponse(message, newChatInterpretation, users) {
  const client = new OpenAIApi(new Configuration({
    apiKey: config.azureOpenaiApiKey,
    azure: {
      apiKey: config.azureOpenaiApiKey,
      endpoint: config.azureOpenaiEndpoint,
      deploymentName: config.azureOpenaiDeploymentName,
    },
  }));

  const systemPrompt = `You are an AI assistant in a group chat. The chat context is: ${newChatInterpretation.newChatPrompt}. The users in this chat are: ${users.map(u => u.name).join(', ')}.`;

  const response = await client.createChatCompletion({
    model: config.azureOpenaiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
  });

  return response.data.choices[0].message?.content || "I'm sorry, I couldn't generate a response.";
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
    throw new Error(`Failed to update chat history: ${updateError.message}`)
  }
}

async function createChatWithInitialMessage(supabase, user_id, message) {
  const initialHistory = [{
    role: 'user',
    content: message,
    type: 'message',
    timestamp: new Date().toISOString()
  }]

  const { data: chatData, error: chatError } = await supabase
    .from('Chat')
    .insert({
      from: user_id,
      to: SYSTEM_USER_ID,
      type: 'human',
      history: initialHistory
    })
    .select()
    .single()

  if (chatError) {
    throw new Error(`Failed to create chat with initial message: ${chatError.message}`)
  }

  return chatData.id
}

Deno.serve(async (req) => {
  const { message } = await req.json()
  const { user_id } = req.user
  const newChatInterpretation = await interpretNewChatPrompt(message)

  const openai = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY'),
  })
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'))

  const chatId = await createChatWithInitialMessage(supabase, user_id, message)

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