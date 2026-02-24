import React from 'react';

export default function PlaceholderPage({ title, message }) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-card">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </div>
  );
}