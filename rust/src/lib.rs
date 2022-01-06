use std::collections::HashMap;
use std::collections::VecDeque;

struct Entry {
    version: u64,
    node: u32,
    index: u32,
    value: u32,
}

struct Log {
    minimum: HashMap<u32, u64>,
    entries: Vec<Entry>,
    consumer: VecDeque<Entry>,
}

impl Log {
    pub fn new(consumer: VecDeque<Entry>) -> Log {
        Log {
            minimum: HashMap::new(),
            entries: vec![],
            consumer: consumer,
        }
    }

    pub fn arrive(&mut self, node: u32) {
        self.minimum.insert(node, 0);
    }

    pub fn push(&mut self, entry: Entry) {
        self.entries.push(entry);
    }
}

#[cfg(test)]
mod tests {
    use crate::Log;
    use crate::Entry;
    use std::collections::VecDeque;

    #[test]
    fn it_logs() {
        let mut log = Log::new(VecDeque::new());
        log.arrive(0);
        log.push(Entry{ version: 0, node: 0, index: 0, value: 0 });
        assert_eq!(1, 1);
    }
}
