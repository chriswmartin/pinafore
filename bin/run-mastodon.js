import { restoreMastodonData } from './restore-mastodon-data'
import pify from 'pify'
import childProcessPromise from 'child-process-promise'
import path from 'path'
import fs from 'fs'
import { waitForMastodonUiToStart, waitForMastodonApiToStart } from './wait-for-mastodon-to-start'
import mkdirpCB from 'mkdirp'

const exec = childProcessPromise.exec
const spawn = childProcessPromise.spawn
const mkdirp = pify(mkdirpCB)
const stat = pify(fs.stat.bind(fs))
const writeFile = pify(fs.writeFile.bind(fs))
const dir = __dirname

const GIT_URL = 'https://github.com/nolanlawson/mastodon'
const GIT_BRANCH = 'for-pinafore'

const DB_NAME = 'pinafore_development'
const DB_USER = 'pinafore'
const DB_PASS = 'pinafore'

const envFile = `
PAPERCLIP_SECRET=foo
SECRET_KEY_BASE=bar
OTP_SECRET=foobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobar
DB_HOST=127.0.0.1
DB_PORT=${process.env.PGPORT || 5432}
DB_USER=${DB_USER}
DB_NAME=${DB_NAME}
DB_PASS=${DB_PASS}
`

const mastodonDir = path.join(dir, '../mastodon')

let childProc

async function cloneMastodon () {
  try {
    await stat(mastodonDir)
  } catch (e) {
    console.log('Cloning mastodon...')
    await exec(`git clone ${GIT_URL} --branch ${GIT_BRANCH} --single-branch --depth 1 "${mastodonDir}"`)
    await writeFile(path.join(dir, '../mastodon/.env'), envFile, 'utf8')
  }
}

async function setupMastodonDatabase () {
  console.log('Setting up mastodon database...')
  try {
    await exec(`psql -d template1 -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}' CREATEDB;"`)
  } catch (e) { /* ignore */ }
  try {
    await exec(`dropdb -h 127.0.0.1 -U ${DB_USER} -w ${DB_NAME}`, {
      cwd: mastodonDir,
      env: Object.assign({PGPASSWORD: DB_PASS}, process.env)
    })
  } catch (e) { /* ignore */ }
  await exec(`createdb -h 127.0.0.1 -U ${DB_USER} -w ${DB_NAME}`, {
    cwd: mastodonDir,
    env: Object.assign({PGPASSWORD: DB_PASS}, process.env)
  })

  let dumpFile = path.join(dir, '../fixtures/dump.sql')
  await exec(`psql -h 127.0.0.1 -U ${DB_USER} -w -d ${DB_NAME} -f "${dumpFile}"`, {
    cwd: mastodonDir,
    env: Object.assign({PGPASSWORD: DB_PASS}, process.env)
  })

  let tgzFile = path.join(dir, '../fixtures/system.tgz')
  let systemDir = path.join(mastodonDir, 'public/system')
  await mkdirp(systemDir)
  await exec(`tar -xzf "${tgzFile}"`, {cwd: systemDir})
}

async function runMastodon () {
  console.log('Running mastodon...')
  let cmds = [
    'gem install bundler foreman',
    'bundle install',
    'yarn --pure-lockfile'
  ]

  for (let cmd of cmds) {
    console.log(cmd)
    await exec(cmd, {cwd: mastodonDir})
  }
  const promise = spawn('foreman', ['start'], {
    cwd: mastodonDir,
    env: Object.assign({}, process.env, {RAILS_ENV: 'development', NODE_ENV: 'development'})
  })
  const log = fs.createWriteStream('mastodon.log', {flags: 'a'})
  childProc = promise.childProcess
  childProc.stdout.pipe(log)
  childProc.stderr.pipe(log)
  promise.catch(err => {
    console.error('foreman start failed, see mastodon.log for details')
    console.error(err)
    shutdownMastodon()
    process.exit(1)
  })
}

async function main () {
  await cloneMastodon()
  await setupMastodonDatabase()
  await runMastodon()
  await waitForMastodonApiToStart()
  await restoreMastodonData()
  await waitForMastodonUiToStart()
}

function shutdownMastodon () {
  if (childProc) {
    console.log('killing child process')
    childProc.kill()
  }
}

process.on('SIGINT', function () {
  shutdownMastodon()
  process.exit(0)
})

main().catch(err => {
  console.error(err)
  shutdownMastodon()
  process.exit(1)
})
