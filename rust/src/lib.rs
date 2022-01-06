use std::collections::HashMap;

struct Entry {
    version: u64,
    node: u32,
    index: u32,
    value: u32,
}

struct Log<F>
    where F: Fn(&Entry),
{
    minimum: HashMap<u32, u64>,
    entries: Vec<Entry>,
    consumer: F,
}

impl<F> Log<F>
    where F: Fn(&Entry),
{
    pub fn new(consumer: F) -> Log<F> {
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

    #[test]
    fn it_logs() {
        let mut log = Log::new(|entry| {});
        log.arrive(0);
        log.push(Entry{ version: 0, node: 0, index: 0, value: 0 });
        assert_eq!(1, 1);
    }
}
