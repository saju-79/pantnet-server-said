require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 3000
const app = express()
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())
// verifyToken
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {

  const db = client.db('plantdb')    //data base name
  const plantsCollection = db.collection('plants');
  const ordersCollection = db.collection('orders');
  const usersCollection = db.collection('users')
  try {

    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })
    // add a plant in db
    app.post('/add-plant', async (req, res) => {
      const plant = req.body
      const result = await plantsCollection.insertOne(plant)
      res.send(result)
    })
    // add a get in db
    app.get('/plant', async (req, res) => {
      try {
        const result = await plantsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch plants" });
      }
    });
    // get a single plant data from db
    app.get('/plant/:id', async (req, res) => {
      const id = req.params.id
      const result = await plantsCollection.findOne({
        _id: new ObjectId(id),
      })
      res.send(result)
    })
    // payment system 
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { plantId, quantity } = req.body;
        const qurey = { _id: new ObjectId(plantId) }

        if (!plantId || !quantity) {
          return res.status(400).send({ error: "Missing plantId or quantity" });
        }
        const plant = await plantsCollection.findOne(qurey);

        if (!plant) {
          return res.status(404).send({ error: "Plant not found" });
        }

        const amount = parseInt(plant.price * quantity * 100); // cents

        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
        });
        res.send({ clientSecret: paymentIntent.client_secret });

      } catch (err) {
        console.error("Stripe Error:", err.message);
        res.status(500).send({ error: err.message });
      }
    });

    // save user uplod db
    app.post('/user', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email }
      const alreadyExists = await usersCollection.findOne(query);
      const updatelastSignInTime = {
        $set: {
          lastSignInTime: new Date().toISOString()
        }
      }
      if (!!alreadyExists) {
        const result = await usersCollection.updateOne(query, updatelastSignInTime);
        return res.send(result)
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get a user's role
    app.get('/user/role/:email', async (req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({ email })
      if (!result) return res.status(404).send({ message: 'User Not Found.' })
      res.send({ role: result?.role })
    })

    // save order data in orders collection in db
    app.post('/order', async (req, res) => {
      const orderData = req.body;
      const result = await ordersCollection.insertOne(orderData);
      res.send(result)
    });

    // update plant quantity(increase/decrease)
    app.patch('/quantity-update/:id', async (req, res) => {
      const id = req.params.id;
      const { quantityToUpdate, status } = req.body
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $inc: {
          quantity: status === 'increase' ? quantityToUpdate : -quantityToUpdate,
        },
      }

      const result = await plantsCollection.updateOne(filter, updateDoc)
      console.log(result)
      res.send(result)
    });


    // get all users for admin

    app.get('/all-users', verifyToken, async (req, res) => {
      const filter = {
        email: {
          $ne: req?.user?.email,
        },
      }
      const result = await usersCollection.find(filter).toArray()
      res.send(result)
    })

    // update a user's role
    app.patch('/user/role/update/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const { role } = req.body
      // console.log(role)
      const filter = { email: email }
      const updateDoc = {
        $set: {
          role,
          status: 'verified',
        },
      }
      const result = await usersCollection.updateOne(filter, updateDoc)
      console.log(result)
      res.send(result)
    }
    )


    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from plantNet Server..')
})

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`)
})


