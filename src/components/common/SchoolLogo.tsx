import React from 'react';
import { useSchoolProfile } from '../../services/schoolService';

interface SchoolLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  lightText?: boolean;
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({
  className = '',
  size = 48,
  showText = false,
  lightText = false
}) => {
  const { profile } = useSchoolProfile();

  return (
    <div className={`flex items-center gap-3 shrink-0 ${className}`}>
      {profile.logo_url ? (
        <div
          className="shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-white shadow-xs border border-slate-200"
          style={{ width: size, height: size }}
        >
          <img
            src={profile.logo_url}
            alt={`Logo ${profile.nama_sekolah}`}
            className="w-full h-full object-contain p-0.5"
            onError={e => {
              // If custom image fails to load, hide image and show fallback
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0 drop-shadow-sm"
          aria-label={`Logo ${profile.nama_sekolah}`}
        >
          {/* Outer shield/circle ring with gold and navy border */}
          <circle cx="60" cy="60" r="56" fill="#0F2942" stroke="#D97706" strokeWidth="3" />
          <circle cx="60" cy="60" r="50" fill="#1E3A8A" stroke="#F8FAFC" strokeWidth="1.5" strokeDasharray="3 2" />

          {/* Central White Shield */}
          <path
            d="M60 22 C78 22 86 28 86 48 C86 70 60 92 60 92 C60 92 34 70 34 48 C34 28 42 22 60 22 Z"
            fill="#FFFFFF"
            stroke="#D97706"
            strokeWidth="1.5"
          />

          {/* Golden Laurel Wreath Leaves */}
          <path
            d="M32 46 C28 56 32 68 40 76 M88 46 C92 56 88 68 80 76"
            stroke="#F59E0B"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Open Book of Knowledge */}
          <path
            d="M44 64 C49 61 55 62 60 64 C65 62 71 61 76 64 V76 C71 73 65 74 60 76 C55 74 49 73 44 76 Z"
            fill="#0F2942"
          />
          <line x1="60" y1="64" x2="60" y2="76" stroke="#FFFFFF" strokeWidth="1.5" />

          {/* Torch of Illumination */}
          <path
            d="M58 40 L62 40 L61 56 L59 56 Z"
            fill="#D97706"
          />
          {/* Flame */}
          <path
            d="M60 30 C62 33 65 35 63 38 C61 40 59 40 57 38 C55 35 58 33 60 30 Z"
            fill="#EF4444"
          />
          <path
            d="M60 33 C61 35 63 36 62 38 C61 39 59 39 58 38 C57 36 59 35 60 33 Z"
            fill="#F59E0B"
          />

          {/* Star of Excellence */}
          <polygon
            points="60,24 61.5,28 65.5,28 62.5,30.5 63.5,34.5 60,32 56.5,34.5 57.5,30.5 54.5,28 58.5,28"
            fill="#F59E0B"
          />

          {/* Text ribbon lower arc */}
          <path
            d="M38 92 Q60 102 82 92"
            stroke="#D97706"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      )}

      {showText && (
        <div className="flex flex-col">
          <span
            className={`font-extrabold tracking-tight leading-tight whitespace-nowrap text-base ${
              lightText ? 'text-white' : 'text-slate-900'
            }`}
          >
            {profile.nama_sekolah}
          </span>
          <span
            className={`text-xs font-medium tracking-wide uppercase whitespace-nowrap ${
              lightText ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            Sistem Informasi Pengelolaan Data Siswa (SIPDS)
          </span>
        </div>
      )}
    </div>
  );
};
