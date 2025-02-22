import express from 'express';
import bodyParser from 'body-parser';
import Bot from 'messenger-bot';

let bot = new Bot({
  token: 'EAAdOeVowZBNIBO9uLXEkshMArd6cZBhaP5RZBObWZBOcGZAhIryMwBnBA8dNMa1SBGo6L9Pu8QZBbWdo1CtLTGXYkdkDB1NYXhUjZAFCqxhHlHPHXlvMS7F991GIlvp0vDgxsjVjL4HtdcBVkcCZBAOGc0PNRvZA1wKa9rKTMZADZAqDWwVq88OoKZBTbQj3vecrR4IZA',
  verify: 'pirhotech',
})

bot.on('error', (err) => {
  console.log(err.message)
})

bot.on('message', (payload, reply) => {
  let text = payload.message.text

  bot.getProfile(payload.sender.id, (err, profile) => {
    if (err) throw err

    reply({ text }, (err) => {
      if (err) throw JSON.stringify(err)

      console.log(`Echoed back to ${profile.first_name} ${profile.last_name}: ${text}`)
    })
  })
})

let app = express()

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
  extended: true
}))

app.get('/facebook', (req, res) => {
  return bot._verify(req, res)
})

app.post('/facebook', (req, res) => {
  bot._handleMessage(req.body)
  res.end(JSON.stringify({status: 'ok'}))
})
app.listen(3000, () => {
  console.log('Server is running on port 3000');
})