import React from "react";

export const Button = ({
  children,
  className = "",
  variant = "default",
  size = "md",
  type = "button",
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors";
  const sizes = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4",
    lg: "h-12 px-6",
    icon: "h-9 w-9",
  };
  const variants = {
    default: "bg-gray-900 text-white hover:bg-gray-800",
    outline: "border border-gray-300 text-gray-900 bg-white hover:bg-gray-50",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type={type}
      className={`${base} ${sizes[size] ?? sizes.md} ${
        variants[variant] ?? variants.default
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
