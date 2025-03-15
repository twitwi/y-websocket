#!/usr/bin/env node

const WebSocket = require('ws')
const http = require('http')
const number = require('lib0/number')
const wss = new WebSocket.Server({ noServer: true })
const setupWSConnection = require('./utils.cjs').setupWSConnection

const host = process.env.HOST || 'localhost'
const port = number.parseInt(process.env.PORT || '1234')

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

wss.on('connection', (conn, req, readOnly) => {
  return setupWSConnection(conn, req, { readOnly })
})

const tokens = new Map()
// Map<token, Array<['read'|'write', regex]>>
// first match wins
// empty key for no-token
// empty regexp for match all
// all paths start with /
// don't forget ^ and $ in relevant
tokens.set('', [
  ['read', '^/labhc-velo-count$'],
  ['read', '']
])
tokens.set('publicos', [['read', '.*']])
tokens.set('typst', [['read', ''], ['write', '^/.*\.typ(|st)$']])

server.on('upgrade', (request, socket, head) => {

  const error = () => {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
  
  // You may check auth of request here..
  // Call `wss.HandleUpgrade` *after* you checked whether the client has access
  // (e.g. by checking cookies, or url parameters).
  // See https://github.com/websockets/ws#client-authentication
  const { url } = request
  if (url === undefined) return error()
  const t = new URL('https://example.com'+url).searchParams.get('t') ?? ''
  if (!t || !tokens.has(t)) return error()
  let access = undefined
  for (const [mode, regex] of tokens.get(t)) {
    const re = new RegExp(regex)
    const match = re.test(url)
    //console.log("regex:", regex, "/// url:", url, "/// =>", match, match && mode)
    if (match) {
      access = mode
      break
    }
  }
  if (!access) return error()
  
  wss.handleUpgrade(request, socket, head, /** @param {any} ws */ ws => {
    wss.emit('connection', ws, request, access !== 'write')
  })
})

server.listen(port, host, () => {
  console.log(`running at '${host}' on port ${port}`)
})
