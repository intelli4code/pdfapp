import React from 'react';

const LoadingSpinner = ({ message = "Loading...", size = "medium" }) => {
  const sizeClasses = {
    small: "w-4 h-4",
    medium: "w-8 h-8",
    large: "w-12 h-12"
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 ${sizeClasses[size]}`}></div>
      <p className="mt-2 text-gray-600 text-sm">{message}</p>
    </div>
  );
};

export default LoadingSpinner;