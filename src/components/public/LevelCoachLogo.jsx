import React from 'react';
import { Link } from 'react-router-dom';

export function LevelCoachWordmark({
  className = '',
  imageClassName = 'h-12 w-auto object-contain',
}) {
  return (
    <span className={`inline-flex items-center ${className}`} aria-label="LevelCoach Training">
      <img
        src="/levelcoach-wordmark.png"
        alt="LevelCoach Training"
        className={imageClassName}
      />
    </span>
  );
}

export function LevelCoachWordmarkPlate({
  className = '',
  imageClassName = 'h-12 w-auto object-contain',
}) {
  return (
    <LevelCoachWordmark
      className={`rounded-xl bg-white px-4 py-2 shadow-sm ${className}`}
      imageClassName={imageClassName}
    />
  );
}

export default function LevelCoachLogo({
  asLink = true,
  markOnly = false,
  className = '',
}) {
  const content = (
    <span className={`inline-flex items-center ${className}`} aria-label="LevelCoach Training">
      <img
        src={markOnly ? '/levelcoach-mark.png' : '/levelcoach-wordmark.png'}
        alt="LevelCoach Training"
        className={markOnly ? 'h-10 w-10 object-contain' : 'h-12 w-auto object-contain'}
      />
    </span>
  );

  if (!asLink) return content;
  return (
    <Link to="/" className="inline-flex items-center">
      {content}
    </Link>
  );
}
