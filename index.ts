import { Client, GatewayIntentBits, Routes, User, InteractionType } from 'discord.js'
import { REST } from '@discordjs/rest'
import { config } from 'dotenv'

import { ProxyAgent } from 'undici'
import dflowerCommand, { buttonHandler, commandHandler, modalSubmitHandler } from './commands/dflower'

const env = config().parsed
const CLIENT_ID = env.CLIENT_ID

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
})


const rest = new REST({ version: '10' }).setToken(env.TOKEN)

if (env.ENV === 'dev') {
  const agent = new ProxyAgent({
    uri: 'http://127.0.0.1:1087',
  })

  client.rest.setAgent(agent)
  rest.setAgent(agent)
}

client.on('ready', () => {
  console.log(`Logged in as ${client?.user?.tag}!`)
})

client.on('interactionCreate', async (interaction) => {

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === dflowerCommand.name) {
      return await commandHandler(interaction, client)
    }
  }

  if (interaction.isButton()) {
    return await buttonHandler(interaction)
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    return await modalSubmitHandler(interaction)
  }
})

client.on('error', error => {
  console.error('client error', error)
})


async function main() {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: [dflowerCommand.toJSON()]
    })
    console.log('Successfully reloaded application (/) commands.')
  } catch (e) {
    console.error(e)
  }
}
main()
console.log('token:', env.TOKEN.slice(65, 72))
client.login(env.TOKEN).catch(console.error)
