import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Client, ComponentType, EmbedBuilder, Interaction, InteractionResponse, MessageMentions, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, TextInputBuilder, TextInputStyle, User } from 'discord.js'
import { NexusGenFieldTypes, NexusGenObjects } from '../lib'
import { queryRoomGifters, queryRoomResult, startRoom, updatePointBatch } from '../lib/graphql'

const dflowerCommand = new SlashCommandBuilder()
  .setName(process.env.ENV === 'dev' ? 'df' : 'dflower')
  .setDescription('Start a peer review session')
  .setDescriptionLocalizations({
    'zh-CN': '开启一次小红花活动',
    'zh-TW': '開啟一次小紅花活動',
  })
  .addStringOption(option =>
    option.setName('members')
      .setDescription('Metion all members participating in the session')
      .setDescriptionLocalizations({
        'zh-CN': '@所有参与活动的成员',
        'zh-TW': '@所有參與活动的成員'
      })
      .setRequired(true)
  )
  // duration in minutes
  .addIntegerOption(option =>
    option.setName('duration')
      .setDescription('Duration of the session in minutes')
      .setDescriptionLocalizations({
        'zh-CN': '活动时长（分钟）',
        'zh-TW': '活動時長（分鐘）'
      })
      .setRequired(true)
      .setChoices({
        name: '10 minutes',
        name_localizations: {
          'zh-CN': '10分钟',
          'zh-TW': '10分鐘'
        },
        value: 10
      }, {
        name: '15 minutes',
        name_localizations: {
          'zh-CN': '15分钟',
          'zh-TW': '15分鐘'
        },
        value: 15
      }, {
        name: '30 minutes',
        name_localizations: {
          'zh-CN': '30分钟',
          'zh-TW': '30分鐘'
        },
        value: 30
      }, {
        name: '1 hours',
        name_localizations: {
          'zh-CN': '1小时',
          'zh-TW': '1小時'
        },
        value: 60
      }, {
        name: '2 hours',
        name_localizations: {
          'zh-CN': '2小时',
          'zh-TW': '2小時'
        },
        value: 120
      }, {
        name: '8 hours',
        name_localizations: {
          'zh-CN': '8小时',
          'zh-TW': '8小時'
        },
        value: 480
      }, {
        name: '24 hours',
        name_localizations: {
          'zh-CN': '24小时',
          'zh-TW': '24小時'
        },
        value: 1440
      })
  )

export const modalSubmitHandler = async function (interaction: ModalSubmitInteraction) {
  if (!interaction.customId.startsWith('modal')) return

  // 'modal-' + interaction.user.id + '-' + roomID
  const idParts = interaction.customId.split('#')
  const senderDiscordId = interaction.user.id
  const roomId = idParts[idParts.length - 1]
  const room = await queryRoomGifters(roomId)

  if (await checkEndAndReply(room.endedAt, interaction)) return

  const gifters = room.gifters
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
  console.log(`points submmited:`, points)

  const res = await updatePointBatch(points.map(p => {
    return {
      roomId,
      point: p.point,
      receiverId: p.receiverId,
      senderId: senderId
    }
  }))
  console.log('updatePointBatch res', res)

  const pointsStr = points.reduce((str, current) => {
    const normalized = res.normalized.find(n => n.receiverId === current.receiverId)
    if (!normalized) return str

    return str + `<@${current.receiverDiscordId}>`
      + `: ${current.point} [${Math.floor(normalized.percent * 100)}%]\n`
  }, '')
  await interaction.reply({
    ephemeral: true,
    content: '🎉 提交成功 🎉\n\n' + pointsStr
      + '\n感谢您的参与！\n'
      + '您可以在活动结束后查看结果。\n'
      + '房间 ID： ' + roomId

  })

  function discordId2GifterId(discordId: string) {
    return gifters.find(g => g.gifter.discordId === discordId).gifter.id
  }
}

function startEmbed(startUserID: string, gifters: NexusGenObjects['GifterOnRoom'][], endedAt: NexusGenFieldTypes['Room']['endedAt'], roomId?: NexusGenFieldTypes['Room']['id']) {
  let members = ''
  for (const gifter of gifters) {
    console.log('user discordId in embed', gifter.gifter.discordId)
    members += `<@${gifter.gifter.discordId}> `
  }

  let description = (roomId ? `房间 ID：${roomId}\n` : '')
  description += `发起人：<@${startUserID}>
结束时间：${new Date(parseInt(endedAt, 10)).toLocaleString()}

`
  description += roomId ? `请 ${members} 点击下方按钮给其他成员送出小红花。每人总共可送出 **100** 朵小红花（不足或超过100朵将按比例折算）。活动结束后将按综合所有人送出的小红花计算最终结果。` : `参与成员：${members}`

  return new EmbedBuilder({
    title: (roomId ? '🌺 ' : '发起') + '小红花活动',
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

export const commandHandler = async function (interaction, client: Client) {

  console.log('command triggered:', interaction.options.data, interaction.options.getString('members'))
  const mention = interaction.options.getString('members')

  const matches = getUsersFromMention(mention)

  const users: User[] = []
  for (const match of matches) {
    const id = match[1]
    console.log('mentioned id:', id)
    if (users.find(u => u.id === id)) continue
    users.push(client.users.cache.get(id))
  }

  if (users.length < 3) {
    await interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder({
        title: '发起失败',
        description: '参与活动的总人数最低为3位'
      })],
    })
    return
  }

  if (users.length > 5) {
    await interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder({
        title: '发起失败',
        description: '暂不支持超过5人的活动'
      })],
    })
    return
  }

  const duration = interaction.options.getInteger('duration')
  const room = await startRoom('', interaction.user.id, interaction.user.tag, duration, users)
  console.log('==========room created==========', room, room.gifters)

  const actionRowComponent = new ActionRowBuilder<ButtonBuilder>().setComponents(
    new ButtonBuilder().setCustomId('cancel').setLabel('取消').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('confirm#' + room.id).setLabel('确定').setStyle(ButtonStyle.Primary)
  )

  // show preview
  await interaction.reply({
    ephemeral: true,
    embeds: [startEmbed(interaction.user.id, room.gifters, room.endedAt)],
    components: [actionRowComponent],
    target: interaction.user
  })

  return
}

async function checkEndAndReply(roomEndedAt, interaction) {
  if (parseInt(roomEndedAt, 10) <= Date.now()) {
    await interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder({
        'title': '🙃 活动已结束',
        // 'description': ''
      })]
    })
    return true
  }
  return false
}

async function checkEndAndReplyResult(room, interaction) {
  if (parseInt(room.endedAt, 10) <= Date.now()) {
    const description = room.tempResult.result.reduce((str, result) => {
      return str + `<@${result.receiverDiscordId}>: ${(result.percent * 100).toFixed(2)}%\n`
    }, '')

    console.log('room endded. result:', room.tempResult.result)
    await interaction.reply({
      ephemeral: false,
      embeds: [new EmbedBuilder({
        title: '活动已结束，结果如下',
        description: description + '\n房间 ID：' + room.id
      })]
    })
    return true
  }
  return false
}

export const buttonHandler = async function (interaction: ButtonInteraction) {
  if (interaction.customId === 'cancel') {
    // TODO can not cancel if it is already started
    await interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder({
        'title': '👌 活动已关闭',
        // 'description': ''
      })]
    })
  }

  if (interaction.customId.startsWith('confirm')) {
    console.log('started a new review session', interaction.id)

    const roomId = interaction.customId.split('#').slice(1)[0]
    const room = await queryRoomGifters(roomId)

    if (await checkEndAndReply(room.endedAt, interaction)) return

    await interaction.reply({
      ephemeral: false,
      embeds: [startEmbed(interaction.user.id, room.gifters, room.endedAt, room.id)],
      components: [{
        type: 1,
        components: [{
          style: ButtonStyle.Primary,
          label: '点击参与 🌺',
          custom_id: 'start' + '#' + roomId,
          disabled: false,
          type: ComponentType.Button
        }]
      }],
    })
    return
  }

  if (interaction.customId.startsWith('start')) {
    const idParts = interaction.customId.split('#')
    const roomId = idParts[idParts.length - 1]
    const room = await queryRoomResult(roomId)

    if (await checkEndAndReplyResult(room, interaction)) return

    const gifters = room.gifters
    const userIDs = idParts[0].split('-').slice(1)
    const indexOfUser = gifters.findIndex(gifter => {
      return gifter.gifter.discordId === interaction.user.id
    })
    console.log('started a new review session', roomId)

    if (indexOfUser < 0) {
      await interaction.reply({
        ephemeral: true,
        embeds: [new EmbedBuilder({
          'title': '🤷 您不在此次活动范围内',
        })]
      })
      return
    }

    const modal = new ModalBuilder()
      .setCustomId('modal#' + roomId)
      .setTitle('小红花')

    for (const gifter of gifters) {
      if (gifter.gifter.discordId === interaction.user.id) continue

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setLabel(gifter.gifter.name)
          .setCustomId('point-' + gifter.gifter.discordId)
          .setRequired(true).setStyle(TextInputStyle.Short)
          .setMinLength(1).setMaxLength(3)
          .setPlaceholder(`请输入送给 ${gifter.gifter.name} 的小红花数量`)
      ))
    }

    console.log(modal.toJSON())
    await interaction.showModal(modal)
    return
  }
}


export default dflowerCommand