import React from "react";

export const Card = ({ className = "", children, ...props }) => (
  <div
    className={`bg-white border border-gray-200 rounded-xl dark:bg-gray-800 dark:border-gray-700 ${className}`}
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
