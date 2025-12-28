"use client"

import { useEffect, useState } from "react"

export function MantisLogo() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex justify-center mb-8">
      <h1
        className={`text-5xl font-mono text-emerald-400 relative ${
          mounted ? "animate-shine" : ""
        }`}
        style={{
          letterSpacing: "0.05em",
        }}
      >
        <span className="mr-2">&gt;</span>
        mantis_
        {/* Gradient shine overlay */}
        <span
          className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-400 to-transparent bg-clip-text text-transparent opacity-0 animate-shine-overlay"
          style={{
            backgroundSize: "200% 100%",
          }}
        >
          <span className="mr-2">&gt;</span>
          mantis_
        </span>
      </h1>
      <style jsx>{`
        @keyframes shine-overlay {
          0% {
            background-position: -200% 0;
            opacity: 0;
          }
          20% {
            opacity: 0.8;
          }
          50% {
            background-position: 0% 0;
            opacity: 1;
          }
          80% {
            opacity: 0.8;
          }
          100% {
            background-position: 200% 0;
            opacity: 0;
          }
        }

        :global(.animate-shine-overlay) {
          animation: shine-overlay 3s ease-in-out infinite;
          animation-delay: 1s;
        }

        :global(.animate-shine) {
          position: relative;
        }
      `}</style>
    </div>
  )
}
