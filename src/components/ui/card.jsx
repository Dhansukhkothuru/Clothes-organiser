import React from "react";

export const Card = ({ className = "", children, ...props }) => (
  <div
    className={`bg-white border border-gray-200 rounded-xl ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardContent = ({ className = "", children, ...props }) => (
  <div className={`p-6 ${className}`} {...props}>
    {children}
  </div>
);
