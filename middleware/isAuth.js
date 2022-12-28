const isAuth = ( req,res, next)=>{
    if(req.session.isAuth){
        next();
    }
    else{
        res.send({
            status:401,
            message:"Invalid Session, Please Log in"
        });
    }
}

module.exports = isAuth;