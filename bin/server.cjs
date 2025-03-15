#!/usr/bin/env node

const WebSocket = require('ws')
const fs = require('fs')
const YAML = require('yaml')
const { z } = require('zod')
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

const zToken = z.string()
const zAccessType = z.union([z.literal('read'), z.literal('write'), z.literal('denied')])
//const zCheck = z.record(zAccessType).refine((checks) => Object.keys(checks).length === 1, '')
//const zTokenMap = z.record(z.array(zCheck))
const zTokenMap = z.record(z.string(), z.record(zAccessType)) // token -> regexp -> mode


let tokens = {} // token -> regexp(ordered) -> mode

function loadTokens(path='tokens.yaml', returnTokens=false) {
  const file = fs.readFileSync(path, 'utf8')
  const res = zTokenMap.parse(YAML.parse(file))
  if (returnTokens) return res
  tokens = res
}
loadTokens()

// Map<token, Array<['read'|'write', regex]>>
// first match wins
// empty key for no-token
// empty regexp for match all
// all paths start with /
// don't forget ^ and $ in relevant
/////////tokens.set('', [
/////////  ['read', '^/labhc-velo-count$'],
/////////  ['read', '']
/////////])
/////////tokens.set('publicos', [['read', '.*']])
/////////tokens.set('typst', [['read', ''], ['write', '^/.*\.typ(|st)$']])

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
  const urlObject = new URL('https://example.com'+url)
  const t = urlObject.searchParams.get('t') ?? ''
  console.log("token:", t, tokens, t in tokens)
  if (!(t in tokens)) return error()
  let access = undefined
  for (const [regex, mode] of Object.entries(tokens[t])) {
    const re = new RegExp(regex)
    const match = re.test(urlObject.pathname)
    console.log("regex:", regex, "/// url:", urlObject.pathname, "/// =>", match, match && mode)
    if (match) {
      access = mode
      break
    }
  }
  if (!access || access === 'denied') return error()
  
  wss.handleUpgrade(request, socket, head, /** @param {any} ws */ ws => {
    wss.emit('connection', ws, request, access !== 'write')
  })
})

server.listen(port, host, () => {
  console.log(`running at '${host}' on port ${port}`)
})
