import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ClothesOrganizer from "./pages/ClothesOrganizer";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClothesOrganizer />
  </React.StrictMode>
);
