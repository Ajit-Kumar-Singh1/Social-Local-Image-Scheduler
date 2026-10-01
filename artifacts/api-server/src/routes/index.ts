import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import pagesRouter from "./pages";
import postsRouter from "./posts";
import imagesRouter from "./images";
import dashboardRouter from "./dashboard";
import uploadsRouter from "./uploads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(pagesRouter);
router.use(postsRouter);
router.use(imagesRouter);
router.use(dashboardRouter);
router.use(uploadsRouter);

export default router;
