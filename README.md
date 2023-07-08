[![server status](https://uptime.betterstack.com/status-badges/v1/monitor/rt08.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

# Pom Pom 小红花

小红花是一个去中心分配工具，如果把要分配的东西比作蛋糕的话，小红花就是分蛋糕的工具：综合每个人对其他人设置的分配比例，算出最终的所有人可以得到的蛋糕比例。

This is the discord bot codebase.

## Run it in your dev environment

```bash
yarn

cp .env.example .env

# run server @see https://github.com/star8ks/dFlower

# You need to get TOKEN and CLIENT_ID form discord developer portal
# edit .env TOKEN CLIENT_ID D_FLOWER_ENDPOINT
# D_FLOWER_ENDPOINT is the server GraqhQL endpoint end with /api/graphql

yarn run dev
```
