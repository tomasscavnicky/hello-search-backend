import { OpenAI } from 'openai';
import { z } from 'zod';

const client = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
});

const NewChatPromptInterpretationSchema = z.object({
  shouldCreateUsers: z.boolean().describe("whether to create new users or not"),
  explicitNewUsersMentioned: z.boolean().describe("whether explicit new users were mentioned in the prompt"),
  explicitNewUsers: z.array(z.object({
    name: z.string().optional().describe("name of the user"),
    phone_number: z.string().describe("phone number of the user"),
    description: z.string().optional().describe("any other information about the user"),
  })).optional().describe("explicit list of new users mentioned in the prompt"),
  newChatPrompt: z.string().optional().describe("prompt for the agent will use to hold the conversation with the user"),
});

type NewChatPromptInterpretation = z.infer<typeof NewChatPromptInterpretationSchema>;

class NewChatPromptInterpretationClass implements NewChatPromptInterpretation {
  shouldCreateUsers: boolean;
  explicitNewUsersMentioned: boolean;
  explicitNewUsers: {
    name: string;
    phone_number: string;
    description: string;
  }[];
  newChatPrompt: string;

  constructor(data: NewChatPromptInterpretation) {
    this.shouldCreateUsers = data.shouldCreateUsers;
    this.explicitNewUsersMentioned = data.explicitNewUsersMentioned;
    this.explicitNewUsers = data.explicitNewUsers;
    this.newChatPrompt = data.newChatPrompt;
  }

  static interpretationPrompt(): string {
    return [
      `You are an AI assistant that interprets agent prompts and extracts
    key information into a JSON format. The JSON must include the following fields:
    ${Object.keys(NewChatPromptInterpretationSchema.shape).join(", ")}.
    You are really good at generating properly formatted JSON. Your output is always
    only the corresponding JSON, nothing else. Output just valid JSON in plain text.`,
      `Interpret the agent prompt and extract the key information into a JSON format. The JSON must include the following fields:
    ${Object.keys(NewChatPromptInterpretationSchema.shape).join(", ")}.
    You are really good at generating properly formatted JSON. Your output is always
    only the corresponding JSON, nothing else. Output just valid JSON in plain text.`,
        `Do not include any other text than the JSON. Not even JSON code tag or any 
    JSON code block or markdown.`,
    ].join("\n\n");
  }
}

async function interpretNewChatPrompt(prompt: string): Promise<NewChatPromptInterpretation> {
  console.info(`Interpreting chat prompt: ${prompt}`);

  const response = await client.chat.completions.create({
    model: Deno.env.get('AZURE_OPENAI_MODEL'),
    messages: [
      {
        role: "system",
        content: NewChatPromptInterpretationClass.interpretationPrompt(),
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  console.log(response)

  const interpretation = NewChatPromptInterpretationSchema.parse(JSON.parse(response.choices[0].message?.content || "{}"));
  const newChat = new NewChatPromptInterpretationClass(interpretation);

  console.info(`Successfully interpreted chat prompt: ${JSON.stringify(newChat)}`);
  return newChat;
}

export { interpretNewChatPrompt };
