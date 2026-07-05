import React from 'react';

export interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`flex-1 cursor-pointer border-none p-3 ${active ? 'bg-[#18a0fb] font-bold text-white' : 'bg-transparent font-normal text-[#333]'}`}
  >
    {children}
  </button>
);

export default NavButton;
