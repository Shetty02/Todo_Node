const AccessModel = require("../models/AccessModel");

const rateLimiting = async (req, res, next)=>{

    const sessionId = req.session.id;
    console.log(sessionId);
    if(!sessionId){
        return res.send({
            status:400,
            message:"Invalid session, Please Login again.",
        });
    }

    const sessionTimeDb = await AccessModel.findOne({ sessionId: sessionId});
    if(!sessionTimeDb){
        // Create the accessModel
        const accessTime = new AccessModel({
            sessionId: sessionId,
            time: Date.now(),       
        })
        await accessTime.save();
        next();
        return;
    }
    const previousAccessTime = sessionTimeDb.time;
    const currentAccessTime = Date.now();

    if(currentAccessTime - previousAccessTime < 2000){
        return res.send({
            status:400,
            message:"Too many request. Please try again in some Time."
        })
    }
    await AccessModel.findOneAndUpdate(
        {sessionId: sessionId},
        {time: Date.now()},
    )
    next();
    return;


};

module.exports = rateLimiting;

