import { useState } from 'react';

export default function useToggle(): [boolean, () => void] {
	const [value, setValue] = useState(false);

	return [value, () => setValue(!value)];
}
