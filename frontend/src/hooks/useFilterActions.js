import { useFilters } from '../context/FilterContext';

export const useFilterActions = () => {
    const { filters, setFilters } = useFilters();

    // Pass the standard setFilters function for direct state updates (e.g., from Navbar)
    // This can be useful for complex state updates or resets.
    const handleSetFilters = (newFilters) => {
        setFilters(newFilters);
    };

    const handleFilterToggle = (filterId) => {
    setFilters(prevFilters => {
      return prevFilters.map(f => {
        if (f.id !== filterId) return f;

        const isThreeStage = f.third_stage !== 'disabled';
        let nextIndex = f.activeStageIndex;

        if (isThreeStage) {
          // Cycle through 0, 1, 2
          nextIndex = (f.activeStageIndex + 1) % 3;
        } else {
          // Toggle between 0 and 1
          nextIndex = f.activeStageIndex === 0 ? 1 : 0;
        }

        return { ...f, activeStageIndex: f.activeStageIndex === -1 ? 0 : nextIndex };
      });
    });
  };

  return {
    filters,
    handleSetFilters,
    handleFilterToggle,
  };
};