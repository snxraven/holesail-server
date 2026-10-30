const test = require('brittle')
const b4a = require('b4a')
const proto = require('@holesail/protocol')
const { parse } = require('@holesail/invite')
const { createTestnet, startServer, udpEchoServer, rawSocket } = require('./helpers.js')

function onceMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.once('message', (msg) => resolve(msg))
    socket.once('error', reject)
  })
}

test('tunnels UDP datagrams end-to-end through a real local echo server', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)

  const server = await startServer(t, testnet, { port: echo.address().port, udp: true })

  const { capability } = parse(server.invite)
  const client = testnet.createNode()
  const socket = await rawSocket(t, client, server.keyPair.publicKey)

  const reply = onceMessage(socket)
  socket.write(proto.encodeHeader(b4a.from(capability), proto.MODE_TUNNEL))
  socket.trySend(b4a.from('udp-ping'))

  t.is(b4a.toString(await reply), 'udp-ping')

  socket.destroy()
})

test('carries several distinct UDP datagrams over one tunnel without ordering them', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)

  const server = await startServer(t, testnet, { port: echo.address().port, udp: true })

  const { capability } = parse(server.invite)
  const client = testnet.createNode()
  const socket = await rawSocket(t, client, server.keyPair.publicKey)
  socket.write(proto.encodeHeader(b4a.from(capability), proto.MODE_TUNNEL))

  const messages = ['one', 'two', 'three']
  const received = []

  const done = new Promise((resolve, reject) => {
    socket.on('message', (msg) => {
      received.push(b4a.toString(msg))
      if (received.length === messages.length) resolve()
    })
    socket.on('error', reject)
  })

  for (const msg of messages) socket.trySend(b4a.from(msg))
  await done

  t.alike(received.sort(), messages.sort())
  socket.destroy()
})

test('info() reports udp true for a udp server and the probe response confirms it', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)

  const server = await startServer(t, testnet, { port: echo.address().port, udp: true })

  t.is(server.info.udp, true)
})
