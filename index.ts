import { Client, GatewayIntentBits, Routes, User, InteractionType } from 'discord.js'
import { REST } from '@discordjs/rest'
import { config } from 'dotenv'

import { ProxyAgent } from 'undici'
import dflowerCommand, { buttonHandler, commandHandler, modalSubmitHandler } from './commands/dflower'

config()
const CLIENT_ID = process.env.CLIENT_ID

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
})


const rest = new REST({ version: '10' }).setToken(process.env.TOKEN)

if (process.env.PROXY) {
  console.log('Using proxy agent')
  const agent = new ProxyAgent({
    uri: process.env.PROXY,
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
      await commandHandler(interaction, client)
      return
    }
  }

  if (interaction.isButton()) {
    await buttonHandler(interaction)
    return
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    await modalSubmitHandler(interaction)
    return
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
console.log('token:', process.env.TOKEN.slice(65, 72))
client.login(process.env.TOKEN).catch(console.error)
