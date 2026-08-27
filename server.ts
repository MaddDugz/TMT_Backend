// server.ts
import express from "express";
import indexerRouter from "./supabase/indexerRouter.ts";
import NFTroutes from "./supabase/NFTroutes.ts";
import "dotenv/config";

const app = express();

// middle ware
app.use(express.json()); //for json body parsing
app.use(express.urlencoded({ extended: true }));  //for form body parsing

function requireAdminAuth(req, res, next) {
  const token = req.headers.authorization;
  if (token !== `${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

//routers
app.use("/onlyOwner/faucet", requireAdminAuth, indexerRouter);
app.use("/onlyOwner/nft",requireAdminAuth,  NFTroutes);


app.listen(3001, () => console.log("Admin server running"));