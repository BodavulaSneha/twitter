const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()
//api-1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(request.body.password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username,password, name,gender) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}',
          '${name}', 
          '${gender}'
        )`
      const dbResponse = await db.run(createUserQuery)
      const newUserId = dbResponse.lastID
      response.send(`User created successfully`)
    }
  } else if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  }
})

//api-2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//authenticateuser
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//api-3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  let {username} = request
  const userid = `select user_id from user where username = '${username}'`
  const userdb = await db.get(userid)
  const query = `select username,tweet,date_time as dateTime from user 
  inner join follower on user.user_id = follower.following_user_id 
  inner join tweet on user.user_id = tweet.user_id 
  where '${userdb.user_id}' = follower.follower_user_id
  order by datetime DESC
  limit 4
  offset 0`
  const dbresponse = await db.all(query)
  response.send(dbresponse)
})

//api-4
app.get('/user/following/', authenticateToken, async (request, response) => {
  let {username} = request
  const userid = `select user_id from user where username = '${username}'`
  const userdb = await db.get(userid)
  const query = `
  select name from user inner join follower on user.user_id = follower.following_user_id
  where '${userdb.user_id}' = follower.follower_user_id`
  const dbresponse = await db.all(query)
  response.send(dbresponse)
})

//api-5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  let {username} = request
  const userid = `select user_id from user where username = '${username}'`
  const userdb = await db.get(userid)
  const query = `
  select name from user inner join follower on user.user_id = follower.follower_user_id
  where '${userdb.user_id}' = follower.following_user_id`
  const dbresponse = await db.all(query)
  response.send(dbresponse)
})

const follows = async (request, response, next) => {
  const {tweetId} = request.params
  let isFollowing = await db.get(`select * from follower
  where
  follower_user_id = (select user_id from user where username = "${request.username}") and
  following_user_id =(select user.user_id from tweet natural join user where tweet_id = ${tweetId})`)
  if (isFollowing === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//api-6
app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  follows,
  async (request, response) => {
    const {tweetId} = request.params
    const {tweet, date_time} = await db.get(
      `select tweet,date_time from tweet where tweet_id =${tweetId}`,
    )
    const {likes} = await db.get(
      `select count(like_id) as likes from like where tweet_id = ${tweetId}`,
    )
    const {replies} = await db.get(
      `select count(reply_id) as replies from reply where tweet_id = ${tweetId}`,
    )
    response.send({tweet, likes, replies, dateTime: date_time})
  },
)

//api-7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  follows,
  async (request, response) => {
    const {tweetId} = request.params
    const query = `select username from user natural join like  where tweet_id = ${tweetId}`
    const likes = await db.all(query)
    const usernames = {likes: likes.map(like => like.username)}
    response.send(usernames)
  },
)

//api-8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  follows,
  async (request, response) => {
    const {tweetId} = request.params
    const query = `select name ,reply from user natural join reply where tweet_id = ${tweetId}`
    const replies = await db.all(query)
    const usernames = {
      replies: replies.map(replye => ({
        name: replye.name,
        reply: replye.reply,
      })),
    }
    response.send(usernames)
  },
)

//api-9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const query = `select tweet.tweet,count(distinct like.like_id) as likes,count(distinct reply.reply_id) as replies,tweet.date_time as dateTime from tweet 
  left join like on tweet.tweet_id = like.tweet_id left join reply on tweet.tweet_id = reply.tweet_id
  where tweet.user_id =(select user_id from user where username = '${request.username}')
  group by tweet.tweet_id;`
  const dbresponse = await db.all(query)
  response.send(dbresponse)
})

//api-10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const query = `insert into tweet(tweet)
  values('${tweet}')`
  const res = await db.run(query)
  response.send('Created a Tweet')
})

//api-11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const twee = `select * from tweet natural join user where user.username ='${request.username}'and tweet.tweet_id = ${tweetId}`
    const validtweet = await db.get(twee)
    if (validtweet !== undefined) {
      const query = `delete from tweet where tweet_id =${tweetId}`
      await db.run(query)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)
module.exports = app
