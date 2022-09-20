import { GraphQLClient, gql } from 'graphql-request'
import { config } from 'dotenv'

config()
// load env variables
import { NexusGenFieldTypeNames, NexusGenFieldTypes, NexusGenInputs, NexusGenObjects, NexusGenRootTypes } from '.'
import { User } from 'discord.js'

export const gqlClientPost = new GraphQLClient(process.env.D_FLOWER_ENDPOINT, {
  method: 'POST',
  jsonSerializer: {
    parse: JSON.parse,
    stringify: JSON.stringify,
  },
})

export const queryGiftersByRoomId = gql`
  query giftersByRoomId($roomId: String!) {
    roomById(id: $roomId) {
      id
      endedAt
      gifters {
        accept
        gifter {
          id
          name
          discordId
          ethAddress
        }
      }
    }
  }
`

export const createRoomMutation = gql`
  mutation createRoom($data: CreateRoomFromDiscord!){
    createRoomFromDiscord(data: $data) {
      id
      name
      endedAt
      createdAt
      creator {name, discordId}

      gifters {
        accept
        gifter {
          id
          name
          discordId
        }
      }
    }
  }
`

export const updatePointMutation = gql`
  mutation updatePoint($data: UpdatePointInput){
    updatePoint(data:$data){
      sender{
        id
        discordId
        name
      }
      receiver{
        id
        discordId
        name
      }
      point
    }
  }
`

export const updatePointBatchMutation = gql`
  mutation updatePointBatch($data: [UpdatePointInput!]!){
    updatePointBatch(data:$data){
      senderId
      senderName
      normalized{
        receiverId
        receiverName
        percent
      }
    }
  }
`

export const getRoomResult = gql`
  query getRoomById($roomId: String!) {
    roomById(id: $roomId) {
      id
      name
      endedAt
      tempResult{
        # allGifted{
        #   ...
        # }
        result{
          receiverId
          receiverDiscordId
          receiverName
          percent
        }
      }
      gifters {
        accept
        gifter {
          id
          name
          discordId
          ethAddress
        }
      }
    }
  }
`

// TODO add return type
export async function queryRoomResult(roomId: string) {
  const data = await gqlClientPost.request(getRoomResult, {
    roomId,
  })

  return data.roomById
}


type RoomGifters = {
  id: NexusGenFieldTypes['Room']['id']
  endedAt: NexusGenFieldTypes['Room']['endedAt']
  gifters: NexusGenObjects['GifterOnRoom'][]
}

export async function queryRoomGifters(roomId: string): Promise<RoomGifters> {
  const data = await gqlClientPost.request(queryGiftersByRoomId, {
    roomId,
  })

  return data.roomById
}

export async function startRoom(roomName, discordId, discordName, durationMinutes, gifters: User[]): Promise<NexusGenFieldTypes['Room']> {
  const input: NexusGenInputs['CreateRoomFromDiscord'] = {
    name: roomName,
    discordId: discordId,
    discordName: discordName,
    durationMinutes,
    gifters: []
  }

  if (gifters.length < 3) {
    throw new Error('Minimum number of gifters is 3.')
  }
  for (const gifter of gifters) {
    input.gifters.push({ discordId: gifter.id, name: gifter.tag })
  }

  console.log('data for create Room', input)

  const variables = {
    data: input
  }

  const ret = await gqlClientPost.request(createRoomMutation, variables)
  return ret.createRoomFromDiscord
}

export async function updatePoint(data: NexusGenInputs['UpdatePointInput']): Promise<NexusGenFieldTypeNames['Point']> {
  const ret = await gqlClientPost.request(updatePointMutation, { data })
  return ret.updatePoint
}

export async function updatePointBatch(data: NexusGenInputs['UpdatePointInput'][]): Promise<NexusGenRootTypes['GiftedResult']> {
  const ret = await gqlClientPost.request(updatePointBatchMutation, { data })
  return ret.updatePointBatch
}