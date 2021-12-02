let CrossButton = ({ onClick = () => {}, extraClass }) => {
  return (
    <div
      class={`flex justify-center items-center cursor-pointer hover:text-gray-400 ${extraClass}`}
      onClick={() => onClick()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </div>
  );
};

export default CrossButton;
