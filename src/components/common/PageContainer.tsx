import React from 'react';

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'default' | 'full';
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = '',
  maxWidth = 'default'
}) => {
  const widthClass = maxWidth === 'full' ? 'max-w-full' : 'max-w-[1440px]';
  return (
    <div className={`w-full min-w-0 overflow-x-hidden ${widthClass} mx-auto space-y-5 sm:space-y-6 ${className}`}>
      {children}
    </div>
  );
};

