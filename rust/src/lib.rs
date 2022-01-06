use std::collections::HashMap;
use std::collections::VecDeque;

pub struct Entry {
    version: u64,
    node: u32,
    index: u32,
    value: u32,
}

pub struct Log {
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

    fn check(&mut self) {
        let mut min = self.minimum();
        for (_, value) in &self.minimum {
            if value < &min {
                min = *value;
            }
        }
        let mut i = 0;
        loop {
            if self.entries[i].version == min {
                break;
            }
            i += 1;
        }
        self.entries.splice(..i, []);
    }

    pub fn minimum(&self) -> u64 {
        self.entries[0].version
    }

    pub fn maximum(&self) -> u64 {
        self.entries[self.entries.len() - 1].version
    }

    pub fn arrive(&mut self, node: u32) {
        self.minimum.insert(node, 0);
    }

    pub fn push(&mut self, entry: Entry) {
        self.entries.push(entry);
    }

    pub fn advance(&mut self, node: u32, version: u64) {
        self.minimum.insert(node, version);
        self.check();
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
        assert_eq!(log.minimum(), 0);
        log.push(Entry{ version: 0, node: 0, index: 0, value: 0 });
        log.arrive(1);
        log.push(Entry{ version: 1, node: 0, index: 0, value: 1 });
        log.push(Entry{ version: 1, node: 0, index: 1, value: 2 });
        log.arrive(2);
        log.push(Entry{ version: 2, node: 0, index: 0, value: 3 });
        log.advance(2, 1);
        log.advance(0, 0);
        log.advance(1, 0);
        assert_eq!(log.minimum(), 0);
    }
}
