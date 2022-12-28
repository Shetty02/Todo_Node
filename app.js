const express = require("express");
const validator = require("validator");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const UserSchema = require("./UserSchema")
const session = require("express-session");
const mongoDBSession = require("connect-mongodb-session")(session);

// Models
const TodoModel = require("./models/TodoModel")

// Middlewares
const {cleanUpAndValidate} = require("./utils/Authutils");
const isAuth = require("./middleware/isAuth");
const rateLimiting = require("./middleware/rateLimiting");

const app = express();

//This for rendering the ejs files example: line 17 & 20. and view engine is like public folder in react
app.set("view engine", "ejs")

// Connection with MonogDB.
mongoose.set('strictQuery', false);
const mongoURI = `mongodb+srv://NehalShetty:12345@todo-nodejs.phzdwkh.mongodb.net/auth-node`;
mongoose.connect(mongoURI,{
    useNewUrlParser: true,
    useUnifiedTopology: true   
})
.then((res)=>{
    console.log("Successfully Connected to DB");
})
.catch((err)=>{
    console.log("Failed to Connect", err);
})

// MiddleWares.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"))

// Adding the Session
const store = new mongoDBSession({
    uri: mongoURI,
    collection: "sessions"
});

app.use(
    session({
        secret: "This is my secret code",
        resave: false,
        saveUninitialized: false,
        store: store,
    })
);

// Routes.
app.get("/", (req,res) =>{
    res.send("Welcome to my App");
})

app.get("/login", (req,res)=>{
    return res.render("login");
})
app.post("/login", async(req,res)=>{
    console.log(req.body)
    const {loginId, password} = req.body;
    if (
      typeof loginId != "string" ||
      typeof password != "string" ||
      !loginId ||
      !password
    ) {
      return res.send({
        status: 400,
        message: "Invalid Data",
      });
    }

    // Find return multiple object inside an array.
    // findone return only one object inside an array.
    let userDB;
    try{
        if(validator.isEmail(loginId)){
            userDB = await UserSchema.findOne({ email: loginId})
        }
        else{
            userDB = await UserSchema.findOne({ username: loginId})
        }
        console.log(userDB);

        if(!userDB){
            return res.send({
                status:400,
                message:"User Not Found, Please Register First.",
                error:err
            });
        }
        // This will be used when we are not validating password.
        // else{
        //     return res.send({
        //         status:200,
        //         message:"User Found.",
        //         data:userDB
        //     });
        // }

        // Compare the password using bcrypt, i.e validating the password by comparing the password enterd by the user ans the password was saved in the database.
        const isMatch = await bcrypt.compare(password, userDB.password);
        if(!isMatch){
            return res.send({
                status:400,
                message:"Invalid Password",
                data:req.body
            });
        }

        // Final Return
        req.session.isAuth = true;
        req.session.user = {
            username: userDB.username,
            email: userDB.email,
            userId: userDB._id
        };


       res.redirect("/dashboard");
    }
    catch(err){
        return res.send({
            status:400,
            message:"Internal Server Error, Please login again",
            error:err
        })
    }
});
 
// This is for demonstration purpose.
// app.get("/home", isAuth ,(req, res) =>{
//     if(req.session.isAuth){
//         return res.send({
//             message:"This is your homepage."
//         })
//     }else{
//         return res.send({
//         message:"Please Login again"
//     })}
// })

app.post("/logout", isAuth, (req,res)=>{
    req.session.destroy((err)=>{
        if(err) throw err;

        res.redirect("/login");
    })
}); 
app.post("/logout_from_all_devices", isAuth, async(req,res)=>{
    console.log(req.session.user.username);
    const username = req.session.user.username;
    const Schema = mongoose.Schema;
    const sessionSchema = new Schema({_id:String},{strict: false});
    const sessionModel = mongoose.model("session", sessionSchema)

    try{
        const sessionDB = await sessionModel.deleteMany({
            "session.user.username": username
        })
        console.log(sessionDB)
        return res.send({
            status:200,
            message:"Logout from all devices" 
        })
    }
    catch(err){
        return res.send({
            status:400,
            message:"Logout from all devices failed",
            error:err
        })
    }
});
app.get("/dashboard", isAuth, async(req, res)=>{
    // let todos = []
    // try{
    //     todos = await TodoModel.find({ username: req.session.user.username});
    //     // return res.send({
    //     //     status:200,
    //     //     message:"Read Successful",
    //     //     data:todos
    //     // })
    //     console.log(todos)
    // }
    // catch(err){
    //     return res.send({
    //         status:400,
    //         message:"Database Error, Please Try again"
    //     }) 
    // }
    // return res.render("dashboard",{ todos : todos });
    return res.render("dashboard");
})

app.post("/pagination_dashboard", isAuth, async(req, res)=>{
    const skip = req.query.skip || 0 ;
    const LIMIT = 5;
    const username = req.session.user.username;

    // MongoDb Aggreation => is we want to perform multiple actions in db, then we use aggreation.

    try{
        let todos = await TodoModel.aggregate([
            {$match:{username : username} },
            {$facet:{
                data : [{ $skip: parseInt(skip)}, { $limit: LIMIT}],
            }}
        ])

        return res.send({
            status: 200,
            message: "Read Successfully",
            data : todos
        })
    }
    catch(err){
        return res.send({
            status:400,
            message:"Database Error, Please Try again",
            error: err
        })
    }
})

app.post("/create-item", isAuth, rateLimiting, async(req, res)=>{
    console.log(req.body);
    const todoText = req.body.todo;
    if(!todoText){
        return res.send({
            status:400,
            message:"Missing Parameters.",
        })
    }
    if(todoText.length > 100){
        return res.send({
            status:400,
            message:"Todo text is very long. Max 100 characters only.",
        })
    }
    let todo = new TodoModel({
        todo:todoText,
        username: req.session.user.username,
    })
    try{
        const todoDb = await todo.save();
        return res.send({
            status:200,
            message:"Todo created Successfully",
            data: todoDb
        })
    }
    catch(err){
        return res.send({
            status:400,
            message:"Database Error, Please Try again"
        })
    }
});

app.post("/edit-item", isAuth, async(req, res)=>{
    const id = req.body.id;
    const newData = req.body.newData;

    if(!id || !newData){
        return res.send({
            status:404,
            message:"Missing Parameter",
            error:"Missing todo data",
        });
    }
    try{
        const todoDb = await TodoModel.findOneAndUpdate(
            {_id:id},
            {todo: newData}
            );
            return res.send({
                status:200,
                message:"Updated todo Successfully",
                data: todoDb,
            })
    }
    catch(err){
        return res.send({
            status:400,
            message:"Database Error, Please Try again",
            error:err
        });
    }
});
app.post("/delete-item", isAuth, async(req, res)=>{
    const id = req.body.id;

    if(!id){
        return res.send({
            status:404,
            message:"Missing Parameter",
            error:"Missing id of todo to delete",
        });
    }
    try{
        const todoDb = await TodoModel.findOneAndDelete(
            {_id:id}
            );
            return res.send({
                status:200,
                message:"Todo Deleted  Successfully",
                data: todoDb,
            })
    }
    catch(err){
        return res.send({
            status:400,
            message:"Database Error, Please Try again",
            error:err
        })
    }
})
app.get("/register", (req,res)=>{
    return res.render("register");
})
app.post("/register", async (req,res)=>{
    console.log(req.body);
    const {name, email, username, password} = req.body;
    try{
        await cleanUpAndValidate({name, email, username, password});
    }
    catch(err){
        return res.send({
            status:400,
            message: err
        })
    }

    // abc123 ==> sadfjdj@@#14
    // bcrypt use md5
    const hashedPassword = await bcrypt.hash(password, 7);
    console.log(hashedPassword);

    // insert the data
    let user = new UserSchema({
        name: name,
        username: username,
        password: hashedPassword,
        email: email,
    });
    // console.log(user)

    // Checking if user Exits.
    let userExists;
    try{
        userExists = await UserSchema.findOne({ email });
    }
    catch(err){
        return res.send({
            status:400,
            message:"Internal server Error. Please try again",
            error: err
        });
    }
    if(userExists){
        return res.send({
            status:400,
            message:"User already exists",
        });
    }
    try{
        const userDB = await user.save(); //Create a operations in DataBase.
        console.log(userDB);
        return res.send({
            status:201,
            message:"Register Successfully",
            data:{
                _id:userDB._id,
                username:userDB.username,
                email: userDB.email
            },
        });
    }
    catch(err){
        return res.send({
            status:400,
            message:"Internal Server Error, Please try again",
            error:err
        });
    }
   
})

const PORT = process.env.PORT || 8000;
app.listen(PORT,() =>{
    console.log(`Listening on port ${PORT}`)
})
