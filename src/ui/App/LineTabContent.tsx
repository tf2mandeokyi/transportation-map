import React from 'react';
import { useLinesContext } from '../contexts/LinesContext';
import EditLinePathSection from '../components/EditLinePathSection';
import LinesSection from '../components/LinesSection';

const LineTabContent: React.FC = () => {
  const { currentEditingLineId } = useLinesContext();
  return currentEditingLineId ? <EditLinePathSection /> : <LinesSection />;
};

export default LineTabContent;
