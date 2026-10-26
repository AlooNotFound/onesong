import {useState, useEffect} from 'react';

export function useServerNow(now, internalMs = 250) {
    const [value, setValue] = useState(() => now());
    useEffect(() => {
        setValue(now());
        const id = setInterval(() => setValue(now()), internalMs);
        return () => clearInterval(id);
    }, [now, internalMs]);
    return value;
}