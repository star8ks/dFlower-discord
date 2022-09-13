import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ComponentType, EmbedBuilder, Interaction, InteractionResponse, MessageMentions, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, TextInputBuilder, TextInputStyle, User } from 'discord.js'
import { NexusGenObjects } from '../lib'
import { queryGifterOnRoom, startRoom, updatePointBatch } from '../lib/graphql'

const dflowerCommand = new SlashCommandBuilder()
  .setName('dflower')
  .setDescription('Start a peer review session')
  .setDescriptionLocalizations({
    'zh-CN': '开启一次小红花互评',
    'zh-TW': '開啟一次小紅花互評'
  })
  .addStringOption(option =>
    option.setName('members')
      .setDescription('metion all members participating in the session')
      .setDescriptionLocalizations({
        'zh-CN': '@所有参与互评的成员',
        'zh-TW': '@所有參與互評的成員'
      })
      .setRequired(true)
  )

// TODO handle re submit points
export const modalSubmitHandler = async function (interaction: ModalSubmitInteraction) {
  if (!interaction.customId.startsWith('modal')) return

  // 'modal-' + interaction.user.id + '-' + roomID
  const idParts = interaction.customId.split('#')
  const roomId = idParts[idParts.length - 1]
  const senderDiscordId = interaction.user.id

  const gifters = await queryGifterOnRoom(roomId)
  const gifter = gifters.find(g => g.gifter.discordId === senderDiscordId)
  const senderId = gifter.gifter.id
  console.log('new modal submit:', { roomId, gifter: gifter.gifter.name })

  const points = interaction.fields.fields.map(field => {
    // TODO field.value must be integer
    const idParts = field.customId.split('-')
    const receiverDiscordId = idParts[idParts.length - 1]
    console.log(idParts)
    const point = parseInt(field.value.trim(), 10) || 0

    return {
      point,
      receiverDiscordId,
      receiverId: discordId2GifterId(receiverDiscordId),
      roomId,
      senderDiscordId
    }
  })
  console.log(points)

  const res = await updatePointBatch(points.map(p => {
    return {
      roomId,
      point: p.point,
      receiverId: p.receiverId,
      senderId: senderId
    }
  }))

  const pointsStr = points.reduce((str, current) => {
    const percent = res.normalized.find(n => n.receiverId === current.receiverId).percent
    return str + `<@${current.receiverDiscordId}>` + `: ${current.point} [${Math.floor(percent * 100)}%]\n`
  }, '')
  await interaction.reply({
    ephemeral: true,
    content: '您的评分已提交：\n' + pointsStr
      + '\n感谢您的参与！\n'
      + '您可以在互评结束后查看结果。\n'
      + 'room ID： ' + roomId

  })

  function discordId2GifterId(discordId: string) {
    return gifters.find(g => g.gifter.discordId === discordId).gifter.id
  }
}

function startEmbed(startUserID: string, gifters: NexusGenObjects['GifterOnRoom'][], roomID = null) {
  let members = ''
  for (const gifter of gifters) {
    console.log('user discordId in embed', gifter.gifter.discordId)
    members += `<@${gifter.gifter.discordId}> `
  }

  let description = (roomID ? `房间ID：${roomID}\n` : '')
  description += `发起人：<@${startUserID}>
互评时间：2小时

**成员**${members}`

  return new EmbedBuilder({
    title: '发起互评',
    description,
    color: 0x00FFFF
  })
}

function getUsersFromMention(mention: string) {
  // The id is the first and only match found by the RegEx.
  const pattern = new RegExp(MessageMentions.UsersPattern, 'g')
  const matches = mention.matchAll(pattern)

  // If supplied variable was not a mention, matches will be null instead of an array.
  if (!matches) return

  // The first element in the matches array will be the entire mention, not just the ID,
  // so use index 1.
  // const id = matches[1]

  return matches
}

export const commandHandler = async function (interaction, client) {

  console.log('command triggered:', interaction.options.data, interaction.options.getString('members'))
  const mention = interaction.options.getString('members')

  const matches = getUsersFromMention(mention)

  const users = []
  for (const match of matches) {
    const id = match[1]
    console.log('mentioned id:', id)
    users.push(client.users.cache.get(id))
  }

  if (users.length < 3) {
    await interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder({
        title: '发起失败',
        description: '参与互评的总人数最低为3位'
      })],
    })
    return
  }

  if (users.length > 5) {
    await interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder({
        title: '发起失败',
        description: '暂不支持超过5人的互评'
      })],
    })
    return
  }

  const room = await startRoom('', interaction.user.id, interaction.user.tag, users)
  console.log('==========room created==========', room, room.gifters)

  const actionRowComponent = new ActionRowBuilder<ButtonBuilder>().setComponents(
    new ButtonBuilder().setCustomId('cancel').setLabel('取消').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('confirm#' + room.id).setLabel('确定').setStyle(ButtonStyle.Primary)
  )

  // show preview
  await interaction.reply({
    ephemeral: true,
    embeds: [startEmbed(interaction.user.id, room.gifters, room.id)],
    components: [actionRowComponent],
    target: interaction.user
  })

  return
}

export const buttonHandler = async function (interaction: ButtonInteraction) {
  if (interaction.customId === 'cancel') {
    // TODO can not cancel if it already started
    await interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder({
        'title': '互评已关闭',
        // 'description': ''
      })]
    })
  }

  if (interaction.customId.startsWith('confirm')) {
    console.log('started a new review session', interaction.id)

    const roomID = interaction.customId.split('#').slice(1)[0]
    const gifters = await queryGifterOnRoom(roomID)

    await interaction.reply({
      ephemeral: false,
      embeds: [startEmbed(interaction.user.id, gifters, roomID)],
      components: [{
        type: 1,
        components: [{
          style: ButtonStyle.Primary,
          label: '参与互评',
          custom_id: 'start' + '#' + roomID,
          disabled: false,
          type: ComponentType.Button
        }]
      }],
    })
    return
  }

  // todo customId start with 'start' and followed by room id
  if (interaction.customId.startsWith('start')) {
    const idParts = interaction.customId.split('#')
    const roomID = idParts[idParts.length - 1]
    const gifters = await queryGifterOnRoom(roomID)
    const userIDs = idParts[0].split('-').slice(1)
    const indexOfUser = gifters.findIndex(gifter => {
      return gifter.gifter.discordId === interaction.user.id
    })
    console.log('started a new review session', roomID)

    if (indexOfUser < 0) {
      await interaction.reply({
        ephemeral: true,
        embeds: [new EmbedBuilder({
          'title': '您不在此次互评范围内',
        })]
      })
      return
    }

    const modal = new ModalBuilder()
      .setCustomId('modal#' + roomID)
      .setTitle('互评')

    for (const gifter of gifters) {
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setLabel(gifter.gifter.name)
          .setCustomId('point-' + gifter.gifter.discordId)
          .setRequired(true).setStyle(TextInputStyle.Short)
      ))
    }

    console.log(modal.toJSON())
    await interaction.showModal(modal)
    return
  }
}


export default dflowerCommand